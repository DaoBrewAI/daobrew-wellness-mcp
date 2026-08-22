import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ELIGIBILITY_BLOCKER_CODES,
  EVIDENCE_INTEGRITY_BLOCKER_CODES,
  TASKMAP_EXECUTABLE_NOW_CHECKS_V1,
  taskMapExecutableNowChecks,
} from "../src/engine/taskmap/executable-now-checks.js";
import type {
  TaskMapReadyFrontierBlockerCode,
  TaskMapReadyFrontierBlockerV1,
} from "../src/engine/taskmap/ready-frontier.js";

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
] as const;

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
] satisfies readonly TaskMapReadyFrontierBlockerCode[];

describe("Task Map isExecutableNow registry", () => {
  it("defines exactly the twelve canonical checks in deterministic order", () => {
    assert.equal(TASKMAP_EXECUTABLE_NOW_CHECKS_V1.length, 12);
    assert.equal(
      new Set(TASKMAP_EXECUTABLE_NOW_CHECKS_V1.map((check) => check.checkId)).size,
      12,
    );
    assert.deepEqual(TASKMAP_EXECUTABLE_NOW_CHECKS_V1, EXPECTED_CHECKS);
  });

  it("maps every eligibility blocker code to exactly one check", () => {
    const mapped = TASKMAP_EXECUTABLE_NOW_CHECKS_V1.flatMap(
      (check) => check.blockerCodes,
    );

    assert.equal(new Set(mapped).size, mapped.length, "no code in two checks");
    assert.deepEqual(new Set(mapped), new Set(ELIGIBILITY_BLOCKER_CODES));
    assert.equal(mapped.length, 14);
  });

  it("keeps evidence-integrity blockers separate and accounts for all 18 codes", () => {
    assert.deepEqual(EVIDENCE_INTEGRITY_BLOCKER_CODES, [
      "proof_target_missing",
      "proof_target_binding_invalid",
      "predecessor_contract_mismatch",
      "privacy_boundary_invalid",
    ]);

    const eligibility = new Set<TaskMapReadyFrontierBlockerCode>(
      ELIGIBILITY_BLOCKER_CODES,
    );
    const evidence = new Set<TaskMapReadyFrontierBlockerCode>(
      EVIDENCE_INTEGRITY_BLOCKER_CODES,
    );
    assert.ok([...eligibility].every((code) => !evidence.has(code)));
    assert.deepEqual(
      new Set([...eligibility, ...evidence]),
      new Set(ALL_READY_FRONTIER_BLOCKER_CODES),
    );
    assert.equal(eligibility.size + evidence.size, 18);
  });

  it("reports a passing check set when there are no blockers", () => {
    const checks = taskMapExecutableNowChecks([]);

    assert.equal(checks.length, 12);
    assert.ok(checks.every((check) => check.passed));
    assert.ok(checks.every((check) => check.blockers.length === 0));
    assert.deepEqual(
      checks.map((check) => check.checkId),
      EXPECTED_CHECKS.map((check) => check.checkId),
    );
  });

  it("fails exactly the check that owns not_open and preserves its object", () => {
    const blocker: TaskMapReadyFrontierBlockerV1 = { code: "not_open" };
    const checks = taskMapExecutableNowChecks([blocker]);
    const failed = checks.filter((check) => !check.passed);

    assert.equal(failed.length, 1);
    assert.equal(failed[0]!.checkId, "open_not_terminal");
    assert.deepEqual(failed[0]!.blockers, [{ code: "not_open" }]);
    assert.equal(failed[0]!.blockers[0], blocker);
  });

  it("makes every eligibility blocker fail exactly its owning check", () => {
    for (const blockerCode of ELIGIBILITY_BLOCKER_CODES) {
      const failed = taskMapExecutableNowChecks([{ code: blockerCode }])
        .filter((check) => !check.passed);
      const owner = TASKMAP_EXECUTABLE_NOW_CHECKS_V1.find(
        (check) => check.blockerCodes.includes(blockerCode),
      );

      assert.equal(failed.length, 1, blockerCode);
      assert.equal(failed[0]!.checkId, owner?.checkId, blockerCode);
    }
  });

  it("preserves relatedTaskId on a dependency blocker", () => {
    const blocker: TaskMapReadyFrontierBlockerV1 = {
      code: "dependency_unresolved",
      relatedTaskId: "tmt_predecessor",
    };
    const failed = taskMapExecutableNowChecks([blocker])
      .find((check) => !check.passed);

    assert.equal(failed?.checkId, "dependencies_resolved");
    assert.deepEqual(failed?.blockers, [blocker]);
    assert.equal(failed?.blockers[0], blocker);
  });

  it("does not make canonical checks fail for evidence-integrity blockers", () => {
    const checks = taskMapExecutableNowChecks(
      EVIDENCE_INTEGRITY_BLOCKER_CODES.map((code) => ({ code })),
    );

    assert.ok(checks.every((check) => check.passed));
    assert.ok(checks.every((check) => check.blockers.length === 0));
  });

  it("freezes the registry and blocker classification arrays", () => {
    assert.equal(Object.isFrozen(TASKMAP_EXECUTABLE_NOW_CHECKS_V1), true);
    assert.ok(
      TASKMAP_EXECUTABLE_NOW_CHECKS_V1.every((check) => Object.isFrozen(check)),
    );
    assert.ok(
      TASKMAP_EXECUTABLE_NOW_CHECKS_V1.every(
        (check) => Object.isFrozen(check.blockerCodes),
      ),
    );
    assert.equal(Object.isFrozen(ELIGIBILITY_BLOCKER_CODES), true);
    assert.equal(Object.isFrozen(EVIDENCE_INTEGRITY_BLOCKER_CODES), true);
  });

  it("does not mutate the blocker input", () => {
    const blocker = Object.freeze<TaskMapReadyFrontierBlockerV1>({
      code: "dependency_unresolved",
      relatedTaskId: "tmt_predecessor",
    });
    const blockers = Object.freeze([blocker]);

    assert.doesNotThrow(() => taskMapExecutableNowChecks(blockers));
    assert.deepEqual(blockers, [{
      code: "dependency_unresolved",
      relatedTaskId: "tmt_predecessor",
    }]);
  });
});
