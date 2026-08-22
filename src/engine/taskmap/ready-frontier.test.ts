import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { TASKMAP_ALGORITHM_POLICY_DIGEST } from "./harness.js";
import type { TaskMapExecutableNowCheckIdV1 } from "./executable-now-checks.js";
import {
  TASKMAP_LOCAL_COMPLETION_CLI_MAX_OUTPUT_BYTES,
  TASKMAP_LOCAL_COMPLETION_CLI_TEST_MODE_ENV,
  TASKMAP_LOCAL_COMPLETION_MAX_READY_TARGETS,
  TASKMAP_LOCAL_COMPLETION_MAX_RESPONSE_TASK_ID_CHARACTERS,
  TASKMAP_LOCAL_COMPLETION_MAX_TERMINAL_TASKS,
  runTaskMapLocalCompletionCli,
  taskMapLocalCompletionCliOutput,
  taskMapLocalCompletionReadyProofTargetsBindingDigest,
  taskMapLocalCompletionTerminalOverlayBindingDigest,
  type TaskMapLocalCompletionCliResponseV1,
} from "./local-completion-cli.js";
import type { TaskMapNativeCurrentnessForWorkV1 } from "./native-current-work-successor.js";
import {
  buildTaskMapReadyProofTargets,
  buildTaskMapReadyFrontier,
  deriveTaskMapReadyProofTargets,
  taskMapReadyFrontierCausalGradeBindingDigest,
  taskMapReadyFrontierCurrentnessBindingDigest,
  taskMapReadyFrontierDeadlineBindingDigest,
  TASKMAP_READY_FRONTIER_LIMITS_V1,
  validateTaskMapReadyFrontier,
  validateTaskMapReadyProofTargets,
  type TaskMapReadyFrontierApprovalPackageBoundaryV1,
  type TaskMapReadyFrontierInputV1,
  type TaskMapReadyFrontierProofTargetV1,
} from "./ready-frontier.js";
import {
  diffTaskMapProjections,
  taskMapContractCanonicalJson,
} from "./source-contracts.js";
import {
  TASKMAP_ALGORITHM_POLICY_VERSION,
  TASKMAP_CONTRACT_VERSION,
  type CausalGrade,
  type TaskMapProjectionV1,
  type TaskMapRoot,
  type TaskMapTask,
} from "./types.js";

async function captureStderr<T>(operation: () => Promise<T>): Promise<{
  value: T;
  stderr: string;
}> {
  const originalWrite = process.stderr.write;
  let stderr = "";
  process.stderr.write = ((chunk: Uint8Array | string) => {
    stderr += typeof chunk === "string"
      ? chunk
      : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stderr.write;
  try {
    return { value: await operation(), stderr };
  } finally {
    process.stderr.write = originalWrite;
  }
}

const EVALUATED_AT = "2026-08-02T12:00:00.000Z";
const HOME_POINTER_ID = "linear-owner-home";
const ZERO_SCORE = {
  sourcePriority: 0,
  deadlinePressure: 0,
  dependencyImpact: 0,
  recurrence: 0,
  staleOpen: 0,
  evidenceStrength: 0,
  bodyBonus: 0,
  total: 0,
};
const ZERO_ROOT_SCORE = {
  maxChildActionability: 0,
  rootRecurrence: 0,
  evidenceStrength: 0,
  sourceBreadth: 0,
  actionableLoad: 0,
  dependencyBreadth: 0,
  bodyBonus: 0,
  total: 0,
};

const TASK_IDS = {
  alpha: "tmt_0000000000000001",
  beta: "tmt_0000000000000002",
  charlie: "tmt_0000000000000003",
  delta: "tmt_0000000000000004",
  echo: "tmt_0000000000000005",
  foxtrot: "tmt_0000000000000006",
  golf: "tmt_0000000000000007",
  hotel: "tmt_0000000000000008",
  future: "tmt_0000000000000009",
  candidate: "tmc_000000000000000a",
} as const;

const ROOT_IDS = {
  neutral: "tmr_1000000000000001",
  beta: "tmr_1000000000000002",
  high: "tmr_1000000000000003",
  medium: "tmr_1000000000000004",
} as const;

const APPROVAL_PACKAGE: TaskMapReadyFrontierApprovalPackageBoundaryV1 = {
  contractVersion: "taskmap-local-approval-inspection.v1",
  readyForLocalApproval: true,
  currentWorkApprovalGranted: false,
  currentWorkExecutable: false,
  authorizationScope: "prepare_local_package_only",
  dispatchAuthorized: false,
  sourceWritebackAuthorized: false,
  codexTaskStartAuthorized: false,
  sourceCompletionAuthorized: false,
  outcomeVerificationAuthorized: false,
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function task(
  id: string,
  rootId: string,
  overrides: Partial<TaskMapTask> = {},
): TaskMapTask {
  return {
    id,
    rootId,
    title: `Task ${id}`,
    summary: `Bounded owner work for ${id}.`,
    reviewState: "accepted",
    openState: "open",
    authority: "source_system",
    taskHomePointerId: HOME_POINTER_ID,
    originPointerIds: [HOME_POINTER_ID],
    returnRoute: {
      state: "source_owned",
      pointerId: HOME_POINTER_ID,
      requiresApproval: true,
    },
    sourceStatus: "open",
    citations: [{
      eventId: `event-${id}`,
      pointerId: HOME_POINTER_ID,
      sourceKind: "linear",
      sourceRefHash: "a".repeat(64),
      occurredAt: "2026-08-01T12:00:00.000Z",
      extractionConfidence: 1,
    }],
    score: { ...ZERO_SCORE },
    whyNow: [],
    discoveredBy: ["linear"],
    bodyContextCount: 0,
    ...overrides,
  };
}

function root(
  id: string,
  taskIds: string[],
  causalGrade: CausalGrade,
): TaskMapRoot {
  return {
    id,
    title: `Root ${id}`,
    summary: `Accepted root for ${id}.`,
    taskIds,
    memberObjectRefs: [`object-${id}`],
    citations: [{
      eventId: `root-event-${id}`,
      pointerId: HOME_POINTER_ID,
      sourceKind: "linear",
      sourceRefHash: "b".repeat(64),
      occurredAt: "2026-08-01T12:00:00.000Z",
      extractionConfidence: 1,
    }],
    causalGrade,
    bodyContextCount: 0,
    scoreBreakdown: { ...ZERO_ROOT_SCORE },
    score: 0,
    whyNow: [],
  };
}

function projectionFixture(): TaskMapProjectionV1 {
  const tasks = [
    task(TASK_IDS.alpha, ROOT_IDS.neutral),
    task(TASK_IDS.beta, ROOT_IDS.beta),
    task(TASK_IDS.charlie, ROOT_IDS.high),
    task(TASK_IDS.delta, ROOT_IDS.medium),
    task(TASK_IDS.echo, ROOT_IDS.medium),
    task(TASK_IDS.foxtrot, ROOT_IDS.medium),
    task(TASK_IDS.golf, ROOT_IDS.medium),
    task(TASK_IDS.hotel, ROOT_IDS.medium),
    task(TASK_IDS.future, ROOT_IDS.beta),
    task(TASK_IDS.candidate, ROOT_IDS.neutral),
  ];
  return {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    algorithmPolicyVersion: TASKMAP_ALGORITHM_POLICY_VERSION,
    algorithmPolicyDigest: TASKMAP_ALGORITHM_POLICY_DIGEST,
    runStatus: "accepted",
    arm: "E4",
    runId: "tmrun_ready_frontier_test",
    generatedAt: "2026-08-02T11:00:00.000Z",
    inputDigest: "d".repeat(64),
    brain: null,
    sources: [{
      id: HOME_POINTER_ID,
      sourceKind: "linear",
      sourceVersion: "linear-owner-snapshot.1",
      authority: "source_system",
      syncMode: "writeback",
      capabilities: ["read_task", "update_status"],
    }],
    roots: [
      root(
        ROOT_IDS.neutral,
        [TASK_IDS.alpha, TASK_IDS.candidate],
        "C0_NO_DATA",
      ),
      root(ROOT_IDS.beta, [TASK_IDS.beta, TASK_IDS.future], "C0_NO_DATA"),
      root(ROOT_IDS.high, [TASK_IDS.charlie], "C4_VALIDATED_PATTERN"),
      root(
        ROOT_IDS.medium,
        [
          TASK_IDS.delta,
          TASK_IDS.echo,
          TASK_IDS.foxtrot,
          TASK_IDS.golf,
          TASK_IDS.hotel,
        ],
        "C2_ATTRIBUTION_CANDIDATE",
      ),
    ],
    tasks,
    edges: [{
      id: "tme_2000000000000001",
      from: TASK_IDS.future,
      to: TASK_IDS.beta,
      relation: "depends_on",
      citations: [{
        eventId: "event-future-dependency",
        pointerId: HOME_POINTER_ID,
        sourceKind: "linear",
        sourceRefHash: "e".repeat(64),
        occurredAt: "2026-08-01T12:00:00.000Z",
        extractionConfidence: 1,
      }],
    }],
    rejections: [],
    privacy: {
      sourceBodiesStored: false,
      localPathsStored: false,
      rawBiometricsStored: false,
    },
  };
}

function cliProjectionFixture(): TaskMapProjectionV1 {
  const projection = projectionFixture();
  projection.tasks = projection.tasks.filter((row) =>
    row.id === TASK_IDS.alpha || row.id === TASK_IDS.beta
  );
  projection.roots = projection.roots
    .map((row) => ({
      ...row,
      taskIds: row.taskIds.filter((taskId) =>
        taskId === TASK_IDS.alpha || taskId === TASK_IDS.beta
      ),
    }))
    .filter((row) => row.taskIds.length > 0);
  projection.edges = [];
  return projection;
}

function currentnessFixture(
  projection: TaskMapProjectionV1,
): TaskMapNativeCurrentnessForWorkV1 {
  return {
    contractVersion: "taskmap-native-currentness-gate.v1",
    runId: projection.runId,
    inputDigest: projection.inputDigest,
    projectionDigest:
      diffTaskMapProjections(null, projection).currentProjectionDigest,
    taskDispositions: projection.tasks.map((row) => ({
      taskId: row.id,
      disposition: "current" as const,
    })),
  };
}

function proofTarget(
  projection: TaskMapProjectionV1,
  taskId: string,
): TaskMapReadyFrontierProofTargetV1 {
  const selected = projection.tasks.find((row) => row.id === taskId)!;
  const taskById = new Map(projection.tasks.map((row) => [row.id, row]));
  const predecessors: TaskMapReadyFrontierProofTargetV1["predecessors"] = [];
  for (const edge of projection.edges) {
    let predecessorId: string | null = null;
    let relation: "depends_on" | "blocks" | null = null;
    if (edge.relation === "depends_on" && edge.from === taskId) {
      predecessorId = edge.to;
      relation = "depends_on";
    } else if (edge.relation === "blocks" && edge.to === taskId) {
      predecessorId = edge.from;
      relation = "blocks";
    }
    if (predecessorId === null || relation === null) continue;
    const predecessor = taskById.get(predecessorId)!;
    predecessors.push({
      taskId: predecessor.id,
      relation,
      reviewState: predecessor.reviewState,
      openState: predecessor.openState,
    });
  }
  predecessors.sort((left, right) =>
    left.taskId < right.taskId ? -1 : left.taskId > right.taskId ? 1 : 0
  );
  return {
    taskId,
    rootId: selected.rootId,
    outcome: `Owner-visible result for ${taskId}.`,
    input: {
      summary: `Bounded input for ${taskId}.`,
      contextPointerIds: [HOME_POINTER_ID],
    },
    predecessors,
    doneDefinition: [`Verify the bounded result for ${taskId}.`],
    permission: {
      requiresExplicitApproval: true,
      approvalGranted: false,
    },
    returnTarget: {
      state: "source_owned",
      pointerId: HOME_POINTER_ID,
    },
    executable: false,
    approvalPackage: clone(APPROVAL_PACKAGE),
  };
}

function inputFixture(): TaskMapReadyFrontierInputV1 {
  const projection = projectionFixture();
  const currentness = currentnessFixture(projection);
  const exactDeadlines = [
    { taskId: TASK_IDS.alpha, deadlineAt: "2026-08-02T11:00:00.000Z" },
    { taskId: TASK_IDS.beta, deadlineAt: "2026-08-02T13:00:00.000Z" },
    { taskId: TASK_IDS.charlie, deadlineAt: "2026-08-02T13:00:00.000Z" },
    // 14:00Z expressed with an offset; exact ordering is by instant, not text.
    { taskId: TASK_IDS.delta, deadlineAt: "2026-08-02T16:00:00.000+02:00" },
    { taskId: TASK_IDS.echo, deadlineAt: "2026-08-02T15:00:00.000Z" },
    { taskId: TASK_IDS.foxtrot, deadlineAt: "2026-08-02T15:00:00.000Z" },
    { taskId: TASK_IDS.golf, deadlineAt: "2026-08-20T12:00:00.000Z" },
    { taskId: TASK_IDS.hotel, deadlineAt: null },
    { taskId: TASK_IDS.future, deadlineAt: null },
    { taskId: TASK_IDS.candidate, deadlineAt: null },
  ];
  const causalGrades = projection.roots.map((row) => ({
    rootId: row.id,
    causalGrade: row.causalGrade,
  }));
  const exactDeadlineSourceDigest = "2".repeat(64);
  const causalGradeSourceDigest = currentness.projectionDigest;
  return {
    projection,
    currentness,
    evaluatedAt: EVALUATED_AT,
    terminalOverlay: {
      contractVersion: "taskmap-local-completion-overlay.v1",
      artifactDigest: "f".repeat(64),
      localOwnerScopeDigest: "1".repeat(64),
      terminalTaskIds: [],
    },
    exactDeadlineSourceDigest,
    exactDeadlineBindingDigest:
      taskMapReadyFrontierDeadlineBindingDigest({
        projection,
        currentness,
        sourceDigest: exactDeadlineSourceDigest,
        rows: exactDeadlines,
      }),
    exactDeadlines,
    causalGradeSourceDigest,
    causalGradeBindingDigest:
      taskMapReadyFrontierCausalGradeBindingDigest({
        projection,
        currentness,
        sourceDigest: causalGradeSourceDigest,
        rows: causalGrades,
      }),
    causalGrades,
    proofTargets: projection.tasks.map((row) => proofTarget(projection, row.id)),
  };
}

function evaluation(
  input: ReturnType<typeof buildTaskMapReadyFrontier>,
  taskId: string,
) {
  return input.evaluations.find((row) => row.taskId === taskId)!;
}

function blockerCodes(
  input: ReturnType<typeof buildTaskMapReadyFrontier>,
  taskId: string,
): string[] {
  return evaluation(input, taskId).blockers.map((row) => row.code);
}

function resealEvidence(input: TaskMapReadyFrontierInputV1): void {
  input.exactDeadlineBindingDigest =
    taskMapReadyFrontierDeadlineBindingDigest({
      projection: input.projection,
      currentness: input.currentness,
      sourceDigest: input.exactDeadlineSourceDigest,
      rows: input.exactDeadlines,
    });
  input.causalGradeSourceDigest = input.currentness.projectionDigest;
  input.causalGradeBindingDigest =
    taskMapReadyFrontierCausalGradeBindingDigest({
      projection: input.projection,
      currentness: input.currentness,
      sourceDigest: input.causalGradeSourceDigest,
      rows: input.causalGrades,
    });
}

describe("Task Map ready frontier", () => {
  it("revalidates a persisted frontier against the exact terminal overlay", () => {
    const input = inputFixture();
    const frontier = buildTaskMapReadyFrontier(input);
    assert.deepEqual(
      validateTaskMapReadyFrontier(frontier, {
        projection: input.projection,
        currentness: input.currentness,
        terminalOverlay: input.terminalOverlay,
        proofTargets: input.proofTargets,
      }),
      frontier,
    );

    const unsealedReadyStatus = clone(frontier);
    unsealedReadyStatus.readyLeaves = [
      ...unsealedReadyStatus.readyLeaves,
      {
        taskId: TASK_IDS.future,
        rootId: ROOT_IDS.beta,
        rank: unsealedReadyStatus.readyLeaves.length + 1,
        readiness: "ready_for_owner_approval",
        approvalGranted: false,
        executable: false,
        rankInputs: evaluation(frontier, TASK_IDS.future).rankInputs,
        proofTarget: proofTarget(input.projection, TASK_IDS.future),
      },
    ];
    assert.throws(
      () => validateTaskMapReadyFrontier(unsealedReadyStatus, {
        projection: input.projection,
        currentness: input.currentness,
        terminalOverlay: input.terminalOverlay,
        proofTargets: input.proofTargets,
      }),
      /persisted frontier seal or evidence binding is invalid/,
    );
    assert.throws(
      () => validateTaskMapReadyFrontier(frontier, {
        projection: input.projection,
        currentness: input.currentness,
        terminalOverlay: {
          ...input.terminalOverlay,
          artifactDigest: "0".repeat(64),
        },
        proofTargets: input.proofTargets,
      }),
      /persisted frontier seal or evidence binding is invalid/,
    );
  });

  it("surfaces the exact open-state check for a task blocked only by open state", () => {
    const input = inputFixture();
    input.projection.tasks.find(
      (row) => row.id === TASK_IDS.alpha,
    )!.openState = "blocked";
    input.currentness = currentnessFixture(input.projection);
    resealEvidence(input);

    const result = evaluation(
      buildTaskMapReadyFrontier(input),
      TASK_IDS.alpha,
    );
    assert.equal(result.readiness, "blocked");
    assert.deepEqual(result.blockers, [{ code: "not_open" }]);
    assert.equal(result.checks.length, 12);
    assert.deepEqual(
      result.checks.filter((check) => !check.passed).map((check) => ({
        checkId: check.checkId,
        reasonCode: check.reasonCode,
        blockers: check.blockers,
      })),
      [{
        checkId: "open_not_terminal",
        reasonCode: "task_not_open_or_terminal",
        blockers: [{ code: "not_open" }],
      }],
    );
  });

  it("keeps every reachable canonical failed check blocked", () => {
    const cases: Array<{
      checkId: TaskMapExecutableNowCheckIdV1;
      taskId: string;
      projectionChanged?: true;
      mutate?: (input: TaskMapReadyFrontierInputV1) => void;
    }> = [
      { checkId: "atomic_task", taskId: TASK_IDS.candidate },
      {
        checkId: "review_accepted",
        taskId: TASK_IDS.alpha,
        projectionChanged: true,
        mutate: (input) => {
          input.projection.tasks.find(
            (row) => row.id === TASK_IDS.alpha,
          )!.reviewState = "proposed";
        },
      },
      {
        checkId: "open_not_terminal",
        taskId: TASK_IDS.alpha,
        projectionChanged: true,
        mutate: (input) => {
          input.projection.tasks.find(
            (row) => row.id === TASK_IDS.alpha,
          )!.openState = "blocked";
        },
      },
      {
        checkId: "lifecycle_current",
        taskId: TASK_IDS.alpha,
        mutate: (input) => {
          input.currentness.taskDispositions.find(
            (row) => row.taskId === TASK_IDS.alpha,
          )!.disposition = "needs_lifecycle_review";
        },
      },
      {
        checkId: "source_contract",
        taskId: TASK_IDS.alpha,
        projectionChanged: true,
        mutate: (input) => {
          input.projection.tasks.find(
            (row) => row.id === TASK_IDS.alpha,
          )!.taskHomePointerId = undefined;
        },
      },
      {
        checkId: "input_contract",
        taskId: TASK_IDS.alpha,
        mutate: (input) => {
          input.proofTargets.find(
            (row) => row.taskId === TASK_IDS.alpha,
          )!.input.summary = "";
        },
      },
      {
        checkId: "done_definition",
        taskId: TASK_IDS.alpha,
        mutate: (input) => {
          input.proofTargets.find(
            (row) => row.taskId === TASK_IDS.alpha,
          )!.doneDefinition = [];
        },
      },
      {
        checkId: "dependencies_resolved",
        taskId: TASK_IDS.future,
      },
      {
        checkId: "permission_boundary",
        taskId: TASK_IDS.alpha,
        mutate: (input) => {
          const target = input.proofTargets.find(
            (row) => row.taskId === TASK_IDS.alpha,
          )!;
          (target.permission as { approvalGranted: boolean })
            .approvalGranted = true;
        },
      },
      {
        checkId: "return_route",
        taskId: TASK_IDS.alpha,
        mutate: (input) => {
          input.proofTargets.find(
            (row) => row.taskId === TASK_IDS.alpha,
          )!.returnTarget = { state: "user_destination_required" };
        },
      },
    ];

    for (const row of cases) {
      const input = inputFixture();
      row.mutate?.(input);
      if (row.projectionChanged === true) {
        input.currentness = currentnessFixture(input.projection);
      }
      resealEvidence(input);
      const result = evaluation(
        buildTaskMapReadyFrontier(input),
        row.taskId,
      );
      const failedCheckIds = result.checks
        .filter((check) => !check.passed)
        .map((check) => check.checkId);
      const allChecksPassed = result.checks.every((check) => check.passed);
      const isReady = result.readiness === "ready";

      assert.deepEqual(failedCheckIds, [row.checkId], row.checkId);
      assert.equal(result.readiness, "blocked", row.checkId);
      assert.equal(allChecksPassed, isReady, row.checkId);
    }

    const baseline = buildTaskMapReadyFrontier(inputFixture());
    for (const result of baseline.evaluations) {
      assert.deepEqual(
        result.checks.map((check) => check.checkId),
        [
          "projection_accepted",
          "atomic_task",
          "root_membership",
          "review_accepted",
          "open_not_terminal",
          "lifecycle_current",
          "source_contract",
          "input_contract",
          "done_definition",
          "dependencies_resolved",
          "permission_boundary",
          "return_route",
        ],
        result.taskId,
      );
      const failedCanonicalCheck = result.checks.some(
        (check) => !check.passed,
      );
      if (result.readiness === "ready") {
        assert.equal(failedCanonicalCheck, false, result.taskId);
      }
      if (failedCanonicalCheck) {
        assert.equal(result.readiness, "blocked", result.taskId);
      }
      assert.equal(
        result.checks.every((check) => check.passed),
        result.readiness === "ready",
        result.taskId,
      );
    }
  });

  it("surfaces checks on the early terminal return without clearing the blocker", () => {
    const input = inputFixture();
    input.terminalOverlay.terminalTaskIds = [TASK_IDS.alpha];

    const result = evaluation(
      buildTaskMapReadyFrontier(input),
      TASK_IDS.alpha,
    );
    assert.equal(result.readiness, "blocked");
    assert.deepEqual(result.blockers, [{ code: "terminal_task" }]);
    assert.deepEqual(
      result.checks.filter((check) => !check.passed).map(
        (check) => check.checkId,
      ),
      ["open_not_terminal"],
    );
  });

  it("keeps evidence-integrity blockers separate while readiness stays blocked", () => {
    const input = inputFixture();
    input.proofTargets = input.proofTargets.filter(
      (row) => row.taskId !== TASK_IDS.alpha,
    );

    const result = evaluation(
      buildTaskMapReadyFrontier(input),
      TASK_IDS.alpha,
    );
    assert.equal(result.readiness, "blocked");
    assert.deepEqual(result.blockers, [{ code: "proof_target_missing" }]);
    assert.equal(result.checks.length, 12);
    assert.ok(result.checks.every((check) => check.passed));
  });

  it("rejects tampering with sealed executable-now checks", () => {
    const input = inputFixture();
    const frontier = buildTaskMapReadyFrontier(input);
    const tampered = clone(frontier);
    evaluation(tampered, TASK_IDS.alpha).checks[0]!.passed = false;

    assert.throws(
      () => validateTaskMapReadyFrontier(tampered, {
        projection: input.projection,
        currentness: input.currentness,
        terminalOverlay: input.terminalOverlay,
        proofTargets: input.proofTargets,
      }),
      /persisted frontier seal or evidence binding is invalid/,
    );
  });

  it("freezes the cross-language CLI binding digest vectors", () => {
    const target: TaskMapReadyFrontierProofTargetV1 = {
      taskId: "tmt_binding_vector",
      rootId: "tmr_binding_vector",
      outcome: "Verify one bounded result.",
      input: {
        summary: "Use the exact bounded input.",
        contextPointerIds: ["linear-owner-home"],
      },
      predecessors: [],
      doneDefinition: ["Observe the exact result."],
      permission: {
        requiresExplicitApproval: true,
        approvalGranted: false,
      },
      returnTarget: {
        state: "source_owned",
        pointerId: "linear-owner-home",
      },
      executable: false,
      approvalPackage: clone(APPROVAL_PACKAGE),
    };
    assert.equal(
      taskMapLocalCompletionTerminalOverlayBindingDigest({
        projectionDigest: "a".repeat(64),
        terminalOverlayArtifactDigest: "b".repeat(64),
        terminalTaskIds: ["tmt_z", "tmt_a"],
      }),
      "b4403ca81158c47cb56daf5c99717906754bbda3390a5f75128b6ff7bcc5ce64",
    );
    assert.equal(
      taskMapLocalCompletionReadyProofTargetsBindingDigest({
        projectionContractVersion: "taskmap-projection.v1",
        runId: "tmrun_binding_vector",
        inputDigest: "c".repeat(64),
        generatedAt: "2026-08-02T12:00:00.000Z",
        projectionDigest: "d".repeat(64),
        currentnessBindingDigest: "f".repeat(64),
        proofTargetSourceArtifactDigest: "e".repeat(64),
        readyProofTargets: [target],
      }),
      "1a658b6c374e2a4d518c82089056fad2db1ac8932a96892d6efb5b31e2087ac7",
    );
    assert.throws(
      () => taskMapLocalCompletionReadyProofTargetsBindingDigest({
        projectionContractVersion: "taskmap-projection.v1",
        runId: "tmrun_binding_vector",
        inputDigest: "c".repeat(64),
        generatedAt: "2026-08-02T12:00:00.000Z",
        projectionDigest: "d".repeat(64),
        currentnessBindingDigest: "f".repeat(64),
        proofTargetSourceArtifactDigest: "e".repeat(64),
        readyProofTargets: Array.from({ length: 33 }, (_, index) => ({
          ...clone(target),
          taskId: `tmt_binding_vector_${index}`,
        })),
      }),
      /unavailable/,
    );
    assert.throws(
      () => buildTaskMapReadyProofTargets({
        projection: inputFixture().projection,
        currentness: inputFixture().currentness,
        proofTargets: Array.from({ length: 33 }, (_, index) => ({
          ...clone(target),
          taskId: `tmt_collection_ceiling_${index}`,
        })),
      }),
      /collection ceiling/,
    );
    assert.throws(
      () => buildTaskMapReadyProofTargets({
        projection: inputFixture().projection,
        currentness: inputFixture().currentness,
        proofTargets: [{
          ...clone(target),
          taskId: "tmt_response_safe_byte_ceiling",
          input: {
            ...clone(target.input),
            contextPointerIds: Array.from({ length: 128 }, (_, index) =>
              `${String(index).padStart(3, "0")}-${"p".repeat(508)}`
            ),
          },
        }],
      }),
      /response-safe byte ceiling/,
    );
  });

  it("keeps the maximum ready and terminal arrays inside the complete 256 KiB CLI envelope", () => {
    const boundedTaskId = (prefix: "r" | "t", index: number) =>
      `tmt_${prefix}${String(index).padStart(27, "0")}`;
    const readyTaskIds = Array.from(
      { length: TASKMAP_LOCAL_COMPLETION_MAX_READY_TARGETS },
      (_, index) => boundedTaskId("r", index),
    );
    const readyProofTargets = readyTaskIds.map((taskId) => ({
      taskId,
      rootId: "tmr_envelope_boundary",
      outcome: "o".repeat(200),
      input: {
        summary: "s".repeat(32),
        contextPointerIds: ["linear-owner-home"],
      },
      predecessors: [],
      doneDefinition: ["Verify the bounded result."],
      permission: {
        requiresExplicitApproval: true as const,
        approvalGranted: false as const,
      },
      returnTarget: {
        state: "source_owned" as const,
        pointerId: "linear-owner-home",
      },
      executable: false as const,
      approvalPackage: clone(APPROVAL_PACKAGE),
    }));
    const terminalTaskIds = Array.from(
      { length: TASKMAP_LOCAL_COMPLETION_MAX_TERMINAL_TASKS },
      (_, index) => boundedTaskId("t", index),
    );
    const closedTaskIds = terminalTaskIds.slice(0, 86);
    const closedExecutionHistory = closedTaskIds.map((taskId, index) => {
      const closeDecisionDigest = index.toString(16).padStart(64, "0");
      return {
        taskId,
        rootId: "tmr_envelope_boundary",
        sessionId:
          `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
        closeDecisionId: `tmlocalclose_${closeDecisionDigest}`,
        closeDecisionDigest,
        closedAt: EVALUATED_AT,
        projectionDigest: "a".repeat(64),
      };
    });
    const completedElsewhereTaskIds = terminalTaskIds.slice(86, 171);
    const conflictedTaskIds = terminalTaskIds.slice(171);
    const projectionDigest = "a".repeat(64);
    const terminalOverlayArtifactDigest = "b".repeat(64);
    const currentnessBindingDigest = "c".repeat(64);
    const proofTargetSourceArtifactDigest = "d".repeat(64);
    const response: TaskMapLocalCompletionCliResponseV1 = {
      contractVersion: "taskmap-local-completion-cli-response.v1",
      status: "overlay",
      taskId: null,
      rootId: null,
      sessionId: null,
      canClose: false,
      canKeepOpen: false,
      closedTaskIds,
      closedExecutionHistory,
      completedElsewhereTaskIds,
      terminalTaskIds,
      conflictedTaskIds,
      closeDecisionId: null,
      closedExecutionBindingDigest: null,
      completionDecisionId: null,
      reopenDecisionId: null,
      projectionContractVersion: "taskmap-projection.v1",
      runId: "tmrun_envelope_boundary",
      inputDigest: "e".repeat(64),
      generatedAt: EVALUATED_AT,
      projectionDigest,
      currentnessBindingDigest,
      terminalOverlayArtifactDigest,
      terminalOverlayBindingDigest:
        taskMapLocalCompletionTerminalOverlayBindingDigest({
          projectionDigest,
          terminalOverlayArtifactDigest,
          terminalTaskIds,
        }),
      readyTaskIds,
      readyProofTargets,
      readyProofTargetsArtifactDigest: proofTargetSourceArtifactDigest,
      readyProofTargetsSourceArtifactDigest:
        proofTargetSourceArtifactDigest,
      readyProofTargetsBindingDigest:
        taskMapLocalCompletionReadyProofTargetsBindingDigest({
          projectionContractVersion: "taskmap-projection.v1",
          runId: "tmrun_envelope_boundary",
          inputDigest: "e".repeat(64),
          generatedAt: EVALUATED_AT,
          projectionDigest,
          currentnessBindingDigest,
          proofTargetSourceArtifactDigest,
          readyProofTargets,
        }),
      readyFrontierDigest: "f".repeat(64),
      sourceWritebackAttempted: false,
      sourceCompletion: false,
      outcomeVerified: false,
    };

    assert.equal(readyTaskIds[0]!.length,
      TASKMAP_LOCAL_COMPLETION_MAX_RESPONSE_TASK_ID_CHARACTERS);
    assert.equal(terminalTaskIds[0]!.length,
      TASKMAP_LOCAL_COMPLETION_MAX_RESPONSE_TASK_ID_CHARACTERS);
    assert.ok(
      Buffer.byteLength(
        taskMapContractCanonicalJson(readyProofTargets),
        "utf8",
      ) <= TASKMAP_READY_FRONTIER_LIMITS_V1.maxProofTargetsArtifactBytes,
    );
    const output = taskMapLocalCompletionCliOutput(response);
    assert.ok(
      Buffer.byteLength(output, "utf8")
        <= TASKMAP_LOCAL_COMPLETION_CLI_MAX_OUTPUT_BYTES,
    );
    assert.throws(
      () => taskMapLocalCompletionCliOutput({
        ...response,
        projectionContractVersion: "x".repeat(
          TASKMAP_LOCAL_COMPLETION_CLI_MAX_OUTPUT_BYTES,
        ),
      }),
      /Task Map local completion CLI unavailable/,
    );
  });

  it("publishes and validates a projection-bound collection of multiple proof targets", () => {
    const input = inputFixture();
    const targets = buildTaskMapReadyProofTargets({
      projection: input.projection,
      currentness: input.currentness,
      proofTargets: input.proofTargets.slice(0, 2),
    });
    const loaded = validateTaskMapReadyProofTargets(
      clone(targets),
      input.projection,
      input.currentness,
    );
    assert.deepEqual(
      loaded.proofTargets.map((row) => row.taskId),
      [TASK_IDS.alpha, TASK_IDS.beta],
    );
    const tampered = clone(targets);
    tampered.proofTargets[0]!.doneDefinition = ["Invented done state"];
    assert.throws(
      () => validateTaskMapReadyProofTargets(
        tampered,
        input.projection,
        input.currentness,
      ),
      /seal or binding is invalid/,
    );
  });

  it("fails closed on Unicode-unsafe display text in built and preserved proof targets", () => {
    const unsafeTargets: Array<{
      label: string;
      mutate: (target: TaskMapReadyFrontierProofTargetV1) => void;
    }> = [
      {
        label: "C1 control in outcome",
        mutate: (target) => {
          target.outcome = "Owner\u0085outcome";
        },
      },
      {
        label: "bidi control in input summary",
        mutate: (target) => {
          target.input.summary = "Owner\u202esummary";
        },
      },
      {
        label: "default-ignorable-only done definition",
        mutate: (target) => {
          target.doneDefinition = ["\u200b"];
        },
      },
    ];

    for (const { label, mutate } of unsafeTargets) {
      const input = inputFixture();
      const target = proofTarget(input.projection, TASK_IDS.alpha);
      mutate(target);
      assert.throws(
        () => buildTaskMapReadyProofTargets({
          projection: input.projection,
          currentness: input.currentness,
          proofTargets: [target],
        }),
        /proof-target display text is invalid/,
        `${label} must be rejected at the durable collection boundary`,
      );
      assert.throws(
        () => deriveTaskMapReadyProofTargets({
          projection: input.projection,
          currentness: input.currentness,
          existingProofTargets: [target],
        }),
        /proof-target display text is invalid/,
        `${label} must not survive as a preserved proof target`,
      );
    }
  });

  it("does not derive proof targets from Unicode-unsafe projection display text", () => {
    const unsafeProjectionText: Array<{
      label: string;
      mutate: (task: TaskMapTask) => void;
    }> = [
      {
        label: "C1 control in projected title",
        mutate: (selected) => {
          selected.title = "Owner\u0085outcome";
        },
      },
      {
        label: "bidi control in projected summary",
        mutate: (selected) => {
          selected.summary = "Owner\u202esummary";
        },
      },
      {
        label: "default-ignorable-only projected title",
        mutate: (selected) => {
          selected.title = "\u200b";
        },
      },
    ];

    for (const { label, mutate } of unsafeProjectionText) {
      const projection = projectionFixture();
      mutate(projection.tasks.find((row) => row.id === TASK_IDS.alpha)!);
      const collection = deriveTaskMapReadyProofTargets({
        projection,
        currentness: currentnessFixture(projection),
        existingProofTargets: [],
      });
      assert.ok(
        !collection.proofTargets.some((row) => row.taskId === TASK_IDS.alpha),
        `${label} must not be copied into a derived proof target`,
      );
      assert.ok(
        collection.proofTargets.some((row) => row.taskId === TASK_IDS.beta),
        `${label} must not suppress unrelated safe proof targets`,
      );
    }
  });

  it("derives every structurally eligible proof target without replacing authenticated semantics or truncating", () => {
    const input = inputFixture();
    const existing = proofTarget(input.projection, TASK_IDS.alpha);
    existing.outcome = "Keep the authenticated owner outcome exactly.";
    existing.input.summary = "Keep the authenticated bounded input exactly.";
    existing.doneDefinition = ["Keep the authenticated done contract exactly."];

    input.projection.tasks.find(
      (row) => row.id === TASK_IDS.golf,
    )!.returnRoute = {
      state: "user_destination_required",
      requiresApproval: true,
    };
    input.currentness = currentnessFixture(input.projection);
    input.currentness.taskDispositions.find(
      (row) => row.taskId === TASK_IDS.hotel,
    )!.disposition = "needs_lifecycle_review";

    const collection = deriveTaskMapReadyProofTargets({
      projection: input.projection,
      currentness: input.currentness,
      existingProofTargets: [existing],
    });
    const byTaskId = new Map(
      collection.proofTargets.map((target) => [target.taskId, target]),
    );

    assert.deepEqual(collection.proofTargets.map((target) => target.taskId), [
      TASK_IDS.alpha,
      TASK_IDS.beta,
      TASK_IDS.charlie,
      TASK_IDS.delta,
      TASK_IDS.echo,
      TASK_IDS.foxtrot,
      TASK_IDS.future,
    ]);
    assert.deepEqual(byTaskId.get(TASK_IDS.alpha), existing);
    const unresolvedSuccessor = byTaskId.get(TASK_IDS.future);
    assert.ok(unresolvedSuccessor);
    const acceptedSuccessor = input.projection.tasks.find(
      (row) => row.id === TASK_IDS.future,
    )!;
    assert.deepEqual(unresolvedSuccessor, {
      taskId: acceptedSuccessor.id,
      rootId: acceptedSuccessor.rootId,
      outcome: acceptedSuccessor.title,
      input: {
        summary: acceptedSuccessor.summary,
        contextPointerIds: [HOME_POINTER_ID],
      },
      predecessors: [{
        taskId: TASK_IDS.beta,
        relation: "depends_on",
        reviewState: "accepted",
        openState: "open",
      }],
      doneDefinition: [acceptedSuccessor.title],
      permission: {
        requiresExplicitApproval: true,
        approvalGranted: false,
      },
      returnTarget: {
        state: "source_owned",
        pointerId: HOME_POINTER_ID,
      },
      executable: false,
      approvalPackage: APPROVAL_PACKAGE,
    });

    const overLimitProjection = projectionFixture();
    const template = overLimitProjection.tasks.find(
      (row) => row.id === TASK_IDS.alpha,
    )!;
    overLimitProjection.tasks = Array.from(
      { length: TASKMAP_READY_FRONTIER_LIMITS_V1.maxProofTargets + 1 },
      (_, index) => ({
        ...clone(template),
        id: `tmt_${(0xe000000000000000n + BigInt(index)).toString(16)}`,
      }),
    );
    overLimitProjection.roots = [{
      ...clone(overLimitProjection.roots.find(
        (row) => row.id === ROOT_IDS.neutral,
      )!),
      taskIds: overLimitProjection.tasks.map((row) => row.id),
    }];
    overLimitProjection.edges = [];
    const overLimitCurrentness = currentnessFixture(overLimitProjection);
    assert.throws(
      () => deriveTaskMapReadyProofTargets({
        projection: overLimitProjection,
        currentness: overLimitCurrentness,
        existingProofTargets: [],
      }),
      /collection ceiling/,
    );
  });

  it("retains an authenticated projected proof target while its task needs lifecycle review", () => {
    const input = inputFixture();
    const existing = proofTarget(input.projection, TASK_IDS.hotel);
    existing.outcome = "Keep the temporarily blocked owner outcome exactly.";
    existing.input.summary = "Keep the temporarily blocked input exactly.";
    existing.doneDefinition = ["Keep the temporarily blocked done state exactly."];
    input.currentness.taskDispositions.find(
      (row) => row.taskId === TASK_IDS.hotel,
    )!.disposition = "needs_lifecycle_review";

    const collection = deriveTaskMapReadyProofTargets({
      projection: input.projection,
      currentness: input.currentness,
      existingProofTargets: [existing],
    });

    assert.deepEqual(
      collection.proofTargets.find((target) => target.taskId === TASK_IDS.hotel),
      existing,
    );
  });

  it("binds collections and frontier evidence to the exact currentness dispositions", () => {
    const input = inputFixture();
    const collection = buildTaskMapReadyProofTargets({
      projection: input.projection,
      currentness: input.currentness,
      proofTargets: input.proofTargets.slice(0, 2),
    });
    const originalCurrentnessDigest =
      taskMapReadyFrontierCurrentnessBindingDigest(input.currentness);
    assert.equal(
      collection.currentness.taskDispositionsDigest,
      originalCurrentnessDigest,
    );

    const tamperedCurrentness = clone(input.currentness);
    tamperedCurrentness.taskDispositions.find(
      (row) => row.taskId === TASK_IDS.alpha,
    )!.disposition = "needs_lifecycle_review";
    assert.notEqual(
      taskMapReadyFrontierCurrentnessBindingDigest(tamperedCurrentness),
      originalCurrentnessDigest,
    );
    assert.throws(
      () => validateTaskMapReadyProofTargets(
        clone(collection),
        input.projection,
        tamperedCurrentness,
      ),
      /seal or binding is invalid/,
    );

    const frontierTamper = inputFixture();
    frontierTamper.currentness.taskDispositions.find(
      (row) => row.taskId === TASK_IDS.alpha,
    )!.disposition = "needs_lifecycle_review";
    assert.throws(
      () => buildTaskMapReadyFrontier(frontierTamper),
      /binding digest does not match/,
    );

    resealEvidence(frontierTamper);
    const rebound = buildTaskMapReadyFrontier(frontierTamper);
    assert.equal(
      rebound.currentness.taskDispositionsDigest,
      taskMapReadyFrontierCurrentnessBindingDigest(
        frontierTamper.currentness,
      ),
    );
    assert.deepEqual(
      blockerCodes(rebound, TASK_IDS.alpha),
      ["not_current"],
    );
  });

  it("keeps every genuinely ready leaf and applies the complete deterministic order", () => {
    const input = inputFixture();
    const frontier = buildTaskMapReadyFrontier(input);

    assert.deepEqual(frontier.readyLeaves.map((row) => row.taskId), [
      TASK_IDS.alpha,
      TASK_IDS.beta,
      TASK_IDS.charlie,
      TASK_IDS.delta,
      TASK_IDS.echo,
      TASK_IDS.foxtrot,
      TASK_IDS.golf,
      TASK_IDS.hotel,
    ]);
    assert.deepEqual(frontier.readyLeaves.map((row) => row.rank), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(evaluation(frontier, TASK_IDS.beta).rankInputs.newlyUnblockedCount, 1);
    assert.deepEqual(evaluation(frontier, TASK_IDS.future).blockers, [{
      code: "dependency_unresolved",
      relatedTaskId: TASK_IDS.beta,
    }]);
    assert.deepEqual(blockerCodes(frontier, TASK_IDS.candidate), ["not_atomic_task"]);
    assert.equal(evaluation(frontier, TASK_IDS.golf).rankInputs.deadlineTierLabel, "later");
    assert.equal(evaluation(frontier, TASK_IDS.hotel).rankInputs.deadlineTierLabel, "none");
    assert.ok(frontier.readyLeaves.every((row) => (
      row.approvalGranted === false
      && row.executable === false
      && row.readiness === "ready_for_owner_approval"
    )));
    assert.equal("winner" in frontier, false);
    assert.deepEqual(frontier, buildTaskMapReadyFrontier(clone(input)));
  });

  it("uses rank inputs only after membership and never lets causal data repair a blocker", () => {
    const input = inputFixture();
    const baseline = buildTaskMapReadyFrontier(input);
    const rerankedInput = clone(input);
    rerankedInput.exactDeadlines = rerankedInput.exactDeadlines.map((row) => (
      row.taskId === TASK_IDS.alpha
        ? { ...row, deadlineAt: "2026-08-30T12:00:00.000Z" }
        : row
    ));
    rerankedInput.causalGrades = rerankedInput.causalGrades.map((row) => (
      row.rootId === ROOT_IDS.neutral
        ? { ...row, causalGrade: "C4_VALIDATED_PATTERN" as const }
        : row
    ));
    rerankedInput.projection.roots.find(
      (row) => row.id === ROOT_IDS.neutral,
    )!.causalGrade = "C4_VALIDATED_PATTERN";
    rerankedInput.currentness = currentnessFixture(
      rerankedInput.projection,
    );
    resealEvidence(rerankedInput);
    const reranked = buildTaskMapReadyFrontier(rerankedInput);

    assert.notDeepEqual(
      reranked.readyLeaves.map((row) => row.taskId),
      baseline.readyLeaves.map((row) => row.taskId),
    );
    assert.deepEqual(
      [...reranked.readyLeaves.map((row) => row.taskId)].sort(),
      [...baseline.readyLeaves.map((row) => row.taskId)].sort(),
    );
    assert.deepEqual(
      reranked.evaluations.map((row) => ({
        taskId: row.taskId,
        readiness: row.readiness,
        blockers: row.blockers,
      })),
      baseline.evaluations.map((row) => ({
        taskId: row.taskId,
        readiness: row.readiness,
        blockers: row.blockers,
      })),
    );
    assert.equal(evaluation(reranked, TASK_IDS.candidate).readiness, "blocked");
    assert.equal(evaluation(reranked, TASK_IDS.candidate).rankInputs.currentCausalTier, 4);
  });

  it("reports exact contract blockers and suppresses terminal leaves before readiness", () => {
    const terminalInput = inputFixture();
    terminalInput.terminalOverlay.terminalTaskIds = [TASK_IDS.alpha];
    const terminal = buildTaskMapReadyFrontier(terminalInput);
    assert.deepEqual(blockerCodes(terminal, TASK_IDS.alpha), ["terminal_task"]);
    assert.ok(!terminal.readyLeaves.some((row) => row.taskId === TASK_IDS.alpha));

    const cases: Array<{
      expected: string;
      mutate: (input: TaskMapReadyFrontierInputV1) => void;
    }> = [
      {
        expected: "not_accepted",
        mutate: (input) => {
          input.projection.tasks.find((row) => row.id === TASK_IDS.alpha)!.reviewState = "proposed";
          input.currentness = currentnessFixture(input.projection);
        },
      },
      {
        expected: "not_open",
        mutate: (input) => {
          input.projection.tasks.find((row) => row.id === TASK_IDS.alpha)!.openState = "blocked";
          input.currentness = currentnessFixture(input.projection);
        },
      },
      {
        expected: "not_current",
        mutate: (input) => {
          input.currentness.taskDispositions.find(
            (row) => row.taskId === TASK_IDS.alpha,
          )!.disposition = "needs_lifecycle_review";
        },
      },
      {
        expected: "proof_target_missing",
        mutate: (input) => {
          input.proofTargets = input.proofTargets.filter(
            (row) => row.taskId !== TASK_IDS.alpha,
          );
        },
      },
      {
        expected: "input_contract_incomplete",
        mutate: (input) => {
          input.proofTargets.find((row) => row.taskId === TASK_IDS.alpha)!.input.summary = "";
        },
      },
      {
        expected: "done_contract_incomplete",
        mutate: (input) => {
          input.proofTargets.find((row) => row.taskId === TASK_IDS.alpha)!.doneDefinition = [];
        },
      },
      {
        expected: "permission_contract_invalid",
        mutate: (input) => {
          const target = input.proofTargets.find((row) => row.taskId === TASK_IDS.alpha)!;
          (target.permission as { approvalGranted: boolean }).approvalGranted = true;
        },
      },
      {
        expected: "return_route_incomplete",
        mutate: (input) => {
          const target = input.proofTargets.find((row) => row.taskId === TASK_IDS.alpha)!;
          target.returnTarget = { state: "user_destination_required" };
        },
      },
      {
        expected: "predecessor_contract_mismatch",
        mutate: (input) => {
          input.proofTargets.find((row) => row.taskId === TASK_IDS.alpha)!.predecessors = [{
            taskId: TASK_IDS.beta,
            relation: "depends_on",
            reviewState: "accepted",
            openState: "open",
          }];
        },
      },
      {
        expected: "approval_package_contract_invalid",
        mutate: (input) => {
          const target = input.proofTargets.find((row) => row.taskId === TASK_IDS.alpha)!;
          (target.approvalPackage as { dispatchAuthorized: boolean }).dispatchAuthorized = true;
        },
      },
    ];

    for (const row of cases) {
      const input = inputFixture();
      row.mutate(input);
      resealEvidence(input);
      const frontier = buildTaskMapReadyFrontier(input);
      assert.ok(
        blockerCodes(frontier, TASK_IDS.alpha).includes(row.expected),
        `${row.expected} was not reported`,
      );
      assert.ok(!frontier.readyLeaves.some((leaf) => leaf.taskId === TASK_IDS.alpha));
    }
  });

  it("rejects deadline or causal rows whose recomputed binding digest does not match", () => {
    const deadlineTamper = inputFixture();
    deadlineTamper.exactDeadlines[0]!.deadlineAt =
      "2026-09-01T00:00:00.000Z";
    assert.throws(
      () => buildTaskMapReadyFrontier(deadlineTamper),
      /binding digest does not match/,
    );

    const causalTamper = inputFixture();
    causalTamper.causalGrades[0]!.causalGrade =
      "C4_VALIDATED_PATTERN";
    assert.throws(
      () => buildTaskMapReadyFrontier(causalTamper),
      /causal-grade evidence is invalid/,
    );
  });

  it("round-trips authenticated multi-target CLI evidence and rejects tamper or projection mismatch", async () => {
    const ownerRoot = await realpath(await mkdtemp(path.join(
      tmpdir(),
      "taskmap-ready-frontier-cli-",
    )));
    const taskMapRoot = path.join(ownerRoot, "taskmap");
    const localExecutionRoot = path.join(
      ownerRoot,
      "taskmap-local-execution",
    );
    await chmod(ownerRoot, 0o700);
    await mkdir(taskMapRoot, { mode: 0o700 });
    await mkdir(localExecutionRoot, { mode: 0o700 });

    try {
      const projection = cliProjectionFixture();
      const currentness = currentnessFixture(projection);
      const targets = [TASK_IDS.alpha, TASK_IDS.beta].map((taskId) =>
        proofTarget(projection, taskId)
      );
      const published = buildTaskMapReadyProofTargets({
        projection,
        currentness,
        proofTargets: targets,
      });
      const proofTargetsPath = path.join(
        taskMapRoot,
        "taskmap-ready-proof-targets.v1.json",
      );
      await writeFile(
        proofTargetsPath,
        taskMapContractCanonicalJson(published),
        { mode: 0o600 },
      );
      const beforeProofTargets = await readFile(proofTargetsPath);
      const selected = targets[0]!;
      const authenticatedPredecessorEvidence = {
        binding: {
          runId: projection.runId,
          inputDigest: projection.inputDigest,
          semanticInputDigest: "3".repeat(64),
          brainOutputDigest: "4".repeat(64),
          replayDigest: "5".repeat(64),
          projectionDigest: currentness.projectionDigest,
          projectionFileDigest: "6".repeat(64),
          currentnessFileDigest: "7".repeat(64),
        },
        taskMapInput: {
          contractVersion: TASKMAP_CONTRACT_VERSION,
          generatedAt: projection.generatedAt,
          pointers: [],
          events: [],
        },
        semanticBrainOutput: {},
      };
      const dependencies = {
        environment: {
          [TASKMAP_LOCAL_COMPLETION_CLI_TEST_MODE_ENV]: "1",
        },
        loadPredecessorEvidence: async (input: {
          homeDirectory: string;
        }) => {
          assert.equal(input.homeDirectory, ownerRoot);
          return authenticatedPredecessorEvidence as never;
        },
        inspectLifecycleContext: async () => ({
          projection,
          currentness,
          localOwnerScopeDigest: "1".repeat(64),
          projectionFileDigest: "6".repeat(64),
          currentnessFileDigest: "7".repeat(64),
        }) as never,
        inspectOperationalContext: async () => ({
          inspection: {
            contractVersion: "taskmap-local-approval-inspection.v1",
            localOwnerScopeDigest: "1".repeat(64),
            quartet: {
              projectionFileDigest: "6".repeat(64),
              currentnessFileDigest: "7".repeat(64),
              currentWorkArtifactDigest: "2".repeat(64),
            },
            task: {
              taskId: selected.taskId,
              rootId: selected.rootId,
              outcome: selected.outcome,
              input: clone(selected.input),
              predecessors: clone(selected.predecessors),
              doneDefinition: [...selected.doneDefinition],
              returnTarget: clone(selected.returnTarget),
            },
            readyForLocalApproval: true,
            currentWorkApprovalGranted: false,
            currentWorkExecutable: false,
            authorizationScope: "prepare_local_package_only",
            dispatchAuthorized: false,
            sourceWritebackAuthorized: false,
            codexTaskStartAuthorized: false,
            sourceCompletionAuthorized: false,
            outcomeVerificationAuthorized: false,
          },
          projection,
          currentness,
        }) as never,
        inspectExecution: async () => {
          throw new Error("read-only frontier inspection must not inspect execution");
        },
      };

      const response = await runTaskMapLocalCompletionCli(
        ["inspect-overlay", "--test-owner-root", ownerRoot],
        dependencies,
      );

      assert.equal(response.status, "overlay");
      assert.equal(
        response.projectionContractVersion,
        projection.contractVersion,
      );
      assert.equal(response.runId, projection.runId);
      assert.equal(response.inputDigest, projection.inputDigest);
      assert.equal(response.generatedAt, projection.generatedAt);
      assert.equal(
        response.projectionDigest,
        currentness.projectionDigest,
      );
      assert.deepEqual(response.readyTaskIds, [TASK_IDS.alpha, TASK_IDS.beta]);
      assert.deepEqual(
        response.readyProofTargets.map((row) => row.taskId),
        response.readyTaskIds,
      );
      assert.deepEqual(response.readyProofTargets, targets);
      assert.equal(
        response.readyProofTargetsArtifactDigest,
        published.artifactDigest,
      );
      assert.equal(
        response.readyProofTargetsSourceArtifactDigest,
        published.artifactDigest,
      );
      assert.equal(
        response.currentnessBindingDigest,
        taskMapReadyFrontierCurrentnessBindingDigest(currentness),
      );
      assert.equal(
        response.terminalOverlayBindingDigest,
        taskMapLocalCompletionTerminalOverlayBindingDigest({
          projectionDigest: currentness.projectionDigest,
          terminalOverlayArtifactDigest:
            response.terminalOverlayArtifactDigest,
          terminalTaskIds: [],
        }),
      );
      assert.equal(
        response.readyProofTargetsBindingDigest,
        taskMapLocalCompletionReadyProofTargetsBindingDigest({
          projectionContractVersion: projection.contractVersion,
          runId: projection.runId,
          inputDigest: projection.inputDigest,
          generatedAt: projection.generatedAt,
          projectionDigest: currentness.projectionDigest,
          currentnessBindingDigest:
            taskMapReadyFrontierCurrentnessBindingDigest(currentness),
          proofTargetSourceArtifactDigest: published.artifactDigest,
          readyProofTargets: targets,
        }),
      );
      assert.match(response.readyFrontierDigest ?? "", /^[a-f0-9]{64}$/);
      assert.deepEqual(response.terminalTaskIds, []);
      assert.ok(
        Buffer.byteLength(taskMapLocalCompletionCliOutput(response), "utf8")
          <= TASKMAP_LOCAL_COMPLETION_CLI_MAX_OUTPUT_BYTES,
      );
      assert.equal(response.sourceWritebackAttempted, false);
      assert.equal(response.sourceCompletion, false);
      assert.equal(response.outcomeVerified, false);

      const forgedEvidencePath = path.join(
        taskMapRoot,
        "taskmap-predecessor-evidence.v1.json",
      );
      await writeFile(
        forgedEvidencePath,
        taskMapContractCanonicalJson({
          artifactDigest: "f".repeat(64),
          taskMapInput: {
            events: [{
              pointerId: HOME_POINTER_ID,
              deadlineAt: "2026-08-02T12:30:00.000Z",
            }],
          },
        }),
        { mode: 0o600 },
      );
      const rejectedTamperResult = await captureStderr(
        () => runTaskMapLocalCompletionCli(
          ["inspect-overlay", "--test-owner-root", ownerRoot],
          {
            ...dependencies,
            loadPredecessorEvidence: async () => {
              throw new Error("authenticated predecessor evidence rejected");
            },
          },
        ),
      );
      const rejectedTamper = rejectedTamperResult.value;
      assert.deepEqual(rejectedTamper.readyTaskIds, []);
      assert.deepEqual(rejectedTamper.readyProofTargets, []);
      assert.equal(rejectedTamper.readyFrontierDigest, null);
      assert.equal(rejectedTamper.readyProofTargetsBindingDigest, null);
      assert.match(
        rejectedTamperResult.stderr,
        /^taskmap-local-completion: ready frontier unavailable\nError: authenticated predecessor evidence rejected/m,
      );
      assert.match(rejectedTamperResult.stderr, /at loadPredecessorEvidence/);
      assert.equal(rejectedTamperResult.stderr.includes(ownerRoot), false);

      const rejectedMismatchResult = await captureStderr(
        () => runTaskMapLocalCompletionCli(
          ["inspect-overlay", "--test-owner-root", ownerRoot],
          {
            ...dependencies,
            loadPredecessorEvidence: async () => ({
              ...authenticatedPredecessorEvidence,
              binding: {
                ...authenticatedPredecessorEvidence.binding,
                projectionDigest: "0".repeat(64),
              },
            }) as never,
          },
        ),
      );
      const rejectedMismatch = rejectedMismatchResult.value;
      assert.deepEqual(rejectedMismatch.readyTaskIds, []);
      assert.deepEqual(rejectedMismatch.readyProofTargets, []);
      assert.equal(rejectedMismatch.readyFrontierDigest, null);
      assert.equal(rejectedMismatch.readyProofTargetsBindingDigest, null);
      assert.match(
        rejectedMismatchResult.stderr,
        /^taskmap-local-completion: ready frontier unavailable\nError: Task Map local completion CLI unavailable/m,
      );

      const rejectedCurrentnessMismatchResult = await captureStderr(
        () => runTaskMapLocalCompletionCli(
          ["inspect-overlay", "--test-owner-root", ownerRoot],
          {
            ...dependencies,
            loadPredecessorEvidence: async () => ({
              ...authenticatedPredecessorEvidence,
              binding: {
                ...authenticatedPredecessorEvidence.binding,
                currentnessFileDigest: "8".repeat(64),
              },
            }) as never,
          },
        ),
      );
      const rejectedCurrentnessMismatch =
        rejectedCurrentnessMismatchResult.value;
      assert.deepEqual(rejectedCurrentnessMismatch.readyTaskIds, []);
      assert.deepEqual(rejectedCurrentnessMismatch.readyProofTargets, []);
      assert.equal(rejectedCurrentnessMismatch.readyFrontierDigest, null);
      assert.equal(
        rejectedCurrentnessMismatch.readyProofTargetsBindingDigest,
        null,
      );
      assert.match(
        rejectedCurrentnessMismatchResult.stderr,
        /^taskmap-local-completion: ready frontier unavailable\nError: Task Map local completion CLI unavailable/m,
      );
      await rm(forgedEvidencePath);

      assert.deepEqual(await readFile(proofTargetsPath), beforeProofTargets);
      assert.deepEqual(await readdir(taskMapRoot), [
        "taskmap-ready-proof-targets.v1.json",
      ]);
      assert.deepEqual(await readdir(localExecutionRoot), []);
    } finally {
      await rm(ownerRoot, { recursive: true, force: true });
    }
  });

  it("keeps a reviewed agent proposal out until owner adoption projects accepted current work", () => {
    const input = inputFixture();
    const selected = input.projection.tasks.find(
      (row) => row.id === TASK_IDS.alpha,
    )!;
    selected.reviewState = "proposed";
    selected.openState = "possibly_open";
    selected.authority = "none";
    input.currentness = currentnessFixture(input.projection);
    resealEvidence(input);

    const proposed = buildTaskMapReadyFrontier(input);
    assert.ok(!proposed.readyLeaves.some(
      (row) => row.taskId === TASK_IDS.alpha,
    ));
    assert.ok(blockerCodes(proposed, TASK_IDS.alpha).includes("not_accepted"));
    assert.ok(blockerCodes(proposed, TASK_IDS.alpha).includes("not_open"));

    selected.reviewState = "accepted";
    selected.openState = "open";
    selected.authority = "user";
    selected.returnRoute = {
      state: "personal_fork",
      pointerId: HOME_POINTER_ID,
      requiresApproval: true,
    };
    input.proofTargets.find(
      (row) => row.taskId === TASK_IDS.alpha,
    )!.returnTarget = {
      state: "personal_fork",
      pointerId: HOME_POINTER_ID,
    };
    const acceptedSource = input.projection.sources.find(
      (row) => row.id === HOME_POINTER_ID,
    )!;
    acceptedSource.sourceKind = "manual";
    acceptedSource.authority = "user";
    acceptedSource.syncMode = "personal_fork";
    for (const citation of selected.citations) {
      citation.sourceKind = "manual";
    }
    input.currentness = currentnessFixture(input.projection);
    resealEvidence(input);

    const adopted = buildTaskMapReadyFrontier(input);
    assert.deepEqual(blockerCodes(adopted, TASK_IDS.alpha), []);
    assert.ok(adopted.readyLeaves.some(
      (row) => row.taskId === TASK_IDS.alpha,
    ));
  });
});
