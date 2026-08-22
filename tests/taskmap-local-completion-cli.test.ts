import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  TASKMAP_LOCAL_COMPLETION_CLI_MAX_OUTPUT_BYTES,
  TASKMAP_LOCAL_COMPLETION_CLI_TEST_MODE_ENV,
  TASKMAP_LOCAL_COMPLETION_MAX_TERMINAL_TASKS,
  parseTaskMapLocalCompletionCliArguments,
  runTaskMapLocalCompletionCli,
  taskMapLocalCompletionCliOutput,
  taskMapLocalCompletionClosedExecutionBindingDigest,
} from "../src/engine/taskmap/local-completion-cli.js";
import type {
  TaskMapAgentExecutionInspectionV1,
} from "../src/engine/taskmap/agent-execution-receipts.js";
import type {
  TaskMapLocalExecutionPackageV1,
} from "../src/engine/taskmap/local-approval-package.js";
import { TASKMAP_ALGORITHM_POLICY_DIGEST } from "../src/engine/taskmap/harness.js";
import {
  diffTaskMapProjections,
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "../src/engine/taskmap/source-contracts.js";
import {
  buildTaskMapReadyProofTargets,
  type TaskMapReadyFrontierProofTargetV1,
} from "../src/engine/taskmap/ready-frontier.js";
import { confirmedTestOwner } from "./support/confirmed-owner.js";
import {
  TASKMAP_ALGORITHM_POLICY_VERSION,
  TASKMAP_CONTRACT_VERSION,
  type TaskMapProjectionV1,
} from "../src/engine/taskmap/types.js";

const digest = (character: string): string => character.repeat(64);
const OWNER_SCOPE = digest("a");
const TASK_ID = "tmt_complete_loop";
const ROOT_ID = "tmr_taskmap_product";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const GENERATED_AT = "2026-07-30T08:00:00.000Z";
const DECIDED_AT = "2026-07-30T08:04:00.000Z";
const POLICY_PRIMARY_TASK_ID = "tmt_f000000000000001";
const POLICY_SECONDARY_TASK_ID = "tmt_a000000000000001";
const POLICY_ROOT_ID = "tmr_9000000000000001";
const POLICY_PRIMARY_POINTER_ID = "linear-policy-primary";
const POLICY_SECONDARY_POINTER_ID = "linear-policy-secondary";
const CLOSED_EXECUTION_BINDING_VECTOR = {
  closeDecisionId: `tmlocalclose_${digest("1")}`,
  taskId: "tmt_binding_vector",
  rootId: "tmr_binding_vector",
  sessionId: "11111111-1111-4111-8111-111111111111",
  packageId: `tmlocalpackage_${digest("2")}`,
  packageDigest: digest("2"),
  workspaceBindingDigest: digest("3"),
  launchedAdapter: "codex_cli",
  startedAt: "2026-08-02T12:00:00.000Z",
  finishedAt: "2026-08-02T12:05:00.000Z",
  artifactCount: 2,
  artifactReceiptDigest: digest("4"),
  reportReceiptDigest: digest("5"),
  reportRelativePaths: ["report.md", "report.html"],
} as const;
const CLOSED_EXECUTION_BINDING_VECTOR_DIGEST =
  "dbf82efdf21e2e6e538d9ef63f9a3b602a591d04bd94fbde21d6c54eac116a86";

function strictEmptyProofProjection(): TaskMapProjectionV1 {
  const taskId = "tmt_0000000000000001";
  const rootId = "tmr_1000000000000001";
  const pointerId = "linear-owner-home";
  const zeroScore = {
    sourcePriority: 0,
    deadlinePressure: 0,
    dependencyImpact: 0,
    recurrence: 0,
    staleOpen: 0,
    evidenceStrength: 0,
    bodyBonus: 0,
    total: 0,
  };
  return {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    algorithmPolicyVersion: TASKMAP_ALGORITHM_POLICY_VERSION,
    algorithmPolicyDigest: TASKMAP_ALGORITHM_POLICY_DIGEST,
    runStatus: "accepted",
    arm: "E4",
    runId: "tmrun_empty_proof_test",
    generatedAt: "2026-08-02T11:00:00.000Z",
    inputDigest: digest("d"),
    brain: null,
    sources: [{
      id: pointerId,
      sourceKind: "linear",
      sourceVersion: "linear-owner-snapshot.1",
      authority: "source_system",
      syncMode: "writeback",
      capabilities: ["read_task", "update_status"],
    }],
    roots: [{
      id: rootId,
      title: "Owner work",
      summary: "Accepted owner work.",
      taskIds: [taskId],
      memberObjectRefs: ["object-owner-work"],
      citations: [{
        eventId: "root-event-owner-work",
        pointerId,
        sourceKind: "linear",
        sourceRefHash: digest("b"),
        occurredAt: "2026-08-01T12:00:00.000Z",
        extractionConfidence: 1,
      }],
      causalGrade: "C0_NO_DATA",
      bodyContextCount: 0,
      scoreBreakdown: {
        maxChildActionability: 0,
        rootRecurrence: 0,
        evidenceStrength: 0,
        sourceBreadth: 0,
        actionableLoad: 0,
        dependencyBreadth: 0,
        bodyBonus: 0,
        total: 0,
      },
      score: 0,
      whyNow: [],
    }],
    tasks: [{
      id: taskId,
      rootId,
      title: "Owner task",
      summary: "Bounded owner work.",
      reviewState: "accepted",
      openState: "open",
      authority: "source_system",
      taskHomePointerId: pointerId,
      originPointerIds: [pointerId],
      returnRoute: {
        state: "source_owned",
        pointerId,
        requiresApproval: true,
      },
      sourceStatus: "open",
      citations: [{
        eventId: "event-owner-task",
        pointerId,
        sourceKind: "linear",
        sourceRefHash: digest("a"),
        occurredAt: "2026-08-01T12:00:00.000Z",
        extractionConfidence: 1,
      }],
      score: zeroScore,
      whyNow: [],
      discoveredBy: ["linear"],
      bodyContextCount: 0,
    }],
    edges: [],
    rejections: [],
    privacy: {
      sourceBodiesStored: false,
      localPathsStored: false,
      rawBiometricsStored: false,
    },
  };
}

it("resolves product completion storage from the confirmed owner only", () => {
  const owner = confirmedTestOwner("local-completion-product-owner");
  const unscopedApplicationSupportRoot = path.join(
    owner.homeDirectory,
    "Library",
    "Application Support",
    "DaoBrew",
  );
  const expectedOwnerRoot = path.join(
    unscopedApplicationSupportRoot,
    "owners",
    owner.ownerScopeDigest,
  );
  const parsed = parseTaskMapLocalCompletionCliArguments(
    ["inspect-overlay"],
    {
      homeDirectory: owner.homeDirectory,
      environment: { DAOBREW_USER_ID: owner.userId },
    },
  );
  assert.equal(owner.ownerRoot, expectedOwnerRoot);
  assert.equal(parsed.roots.ownerRoot, expectedOwnerRoot);
  assert.notEqual(parsed.roots.ownerRoot, unscopedApplicationSupportRoot);
  assert.equal(
    parsed.roots.taskMapRoot,
    path.join(expectedOwnerRoot, "taskmap"),
  );
  assert.equal(
    parsed.roots.decisionsRoot,
    path.join(
      expectedOwnerRoot,
      "taskmap-local-execution",
      "completion-decisions",
    ),
  );
  assert.throws(
    () => parseTaskMapLocalCompletionCliArguments(
      ["inspect-overlay"],
      {
        homeDirectory: owner.homeDirectory,
        environment: {
          DAOBREW_USER_ID: "00000000-0000-4000-8000-000000000000",
        },
      },
    ),
    /Task Map local completion CLI unavailable/,
  );
});

it("preserves empty stdout and exit status without echoing invalid argv", () => {
  const entrypoint = path.resolve(
    __dirname,
    "../src/engine/taskmap/local-completion-cli.js",
  );
  const unreflectedArgument = "PRIVATE_LOCAL_COMPLETION_ARGUMENT";
  const result = spawnSync(process.execPath, [entrypoint, unreflectedArgument], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(
    result.stderr,
    /^taskmap-local-completion: unavailable\nError: Task Map local completion CLI unavailable/m,
  );
  assert.match(result.stderr, /at fail/);
  assert.equal(result.stderr.includes(unreflectedArgument), false);
});

it("quarantines a private legacy terminal overlay instead of exposing an empty fresh-owner lifecycle", async () => {
  const owner = confirmedTestOwner(
    "local-completion-legacy-terminal-quarantine",
  );
  const legacyExecutionRoot = path.join(
    owner.homeDirectory,
    "Library",
    "Application Support",
    "DaoBrew",
    "taskmap-local-execution",
  );
  const legacyOverlayPath = path.join(
    legacyExecutionRoot,
    "completion-overlay.v1.json",
  );
  const legacyBytes = Buffer.from("{\"legacyTerminal\":true}\n", "utf8");
  await rm(owner.ownerRoot, { recursive: true, force: true });
  await mkdir(legacyExecutionRoot, { recursive: true, mode: 0o700 });
  await chmod(legacyExecutionRoot, 0o700);
  await writeFile(legacyOverlayPath, legacyBytes, { mode: 0o600 });
  try {
    await assert.rejects(
      runTaskMapLocalCompletionCli(
        ["inspect-overlay"],
        {
          homeDirectory: owner.homeDirectory,
          environment: { DAOBREW_USER_ID: owner.userId },
        },
      ),
      (error: unknown) => (
        error instanceof Error
        && error.name === "TaskMapLegacyLocalStateQuarantineError"
        && (error as Error & { code?: string }).code
          === "TASKMAP_LEGACY_LOCAL_STATE_QUARANTINED"
      ),
    );
    assert.deepEqual(await readFile(legacyOverlayPath), legacyBytes);
    await assert.rejects(
      lstat(path.join(
        owner.ownerRoot,
        "taskmap-local-execution",
      )),
      { code: "ENOENT" },
    );
  } finally {
    await rm(legacyExecutionRoot, { recursive: true, force: true });
    await rm(owner.ownerRoot, { recursive: true, force: true });
  }
});

it("does not treat an unrelated owner decision as proof that all legacy terminal state migrated", async () => {
  const owner = confirmedTestOwner(
    "local-completion-mixed-legacy-terminal-quarantine",
  );
  const ownerDecisionsRoot = path.join(
    owner.ownerRoot,
    "taskmap-local-execution",
    "completion-decisions",
  );
  const ownerDecisionPath = path.join(
    ownerDecisionsRoot,
    "owner-close.json",
  );
  const legacyExecutionRoot = path.join(
    owner.homeDirectory,
    "Library",
    "Application Support",
    "DaoBrew",
    "taskmap-local-execution",
  );
  const legacyDecisionsRoot = path.join(
    legacyExecutionRoot,
    "completion-decisions",
  );
  const legacyDecisionPath = path.join(
    legacyDecisionsRoot,
    "unattributed-legacy-close.json",
  );
  const ownerBytes = Buffer.from("{\"ownerTerminal\":true}\n", "utf8");
  const legacyBytes = Buffer.from("{\"legacyTerminal\":true}\n", "utf8");
  await rm(owner.ownerRoot, { recursive: true, force: true });
  await mkdir(ownerDecisionsRoot, { recursive: true, mode: 0o700 });
  await chmod(path.join(owner.ownerRoot, "taskmap-local-execution"), 0o700);
  await chmod(ownerDecisionsRoot, 0o700);
  await writeFile(ownerDecisionPath, ownerBytes, { mode: 0o600 });
  await mkdir(legacyDecisionsRoot, { recursive: true, mode: 0o700 });
  await chmod(legacyExecutionRoot, 0o700);
  await chmod(legacyDecisionsRoot, 0o700);
  await writeFile(legacyDecisionPath, legacyBytes, { mode: 0o600 });
  try {
    await assert.rejects(
      runTaskMapLocalCompletionCli(
        ["inspect-overlay"],
        {
          homeDirectory: owner.homeDirectory,
          environment: { DAOBREW_USER_ID: owner.userId },
        },
      ),
      (error: unknown) => (
        error instanceof Error
        && error.name === "TaskMapLegacyLocalStateQuarantineError"
        && (error as Error & { code?: string }).code
          === "TASKMAP_LEGACY_LOCAL_STATE_QUARANTINED"
      ),
    );
    assert.deepEqual(await readFile(ownerDecisionPath), ownerBytes);
    assert.deepEqual(await readFile(legacyDecisionPath), legacyBytes);
  } finally {
    await rm(legacyExecutionRoot, { recursive: true, force: true });
    await rm(owner.ownerRoot, { recursive: true, force: true });
  }
});

it("does not synthesize a singleton ready leaf when proof targets are missing", async () => {
  const value = await fixture();
  let approvalInspections = 0;
  const currentProjection = strictEmptyProofProjection();
  const currentTaskId = currentProjection.tasks[0]!.id;
  const projectionDigest = diffTaskMapProjections(
    null,
    currentProjection as never,
  ).currentProjectionDigest;
  try {
    const response = await runTaskMapLocalCompletionCli(
      ["overlay", "--test-owner-root", value.ownerRoot],
      {
        ...value.dependencies,
        inspectLifecycleContext: async () => ({
          projection: currentProjection,
          currentness: {
            contractVersion: "taskmap-native-currentness-gate.v1",
            runId: currentProjection.runId,
            inputDigest: currentProjection.inputDigest,
            projectionDigest,
            taskDispositions: [{
              taskId: currentTaskId,
              disposition: "current",
            }],
          },
          localOwnerScopeDigest: OWNER_SCOPE,
          projectionFileDigest: digest("7"),
          currentnessFileDigest: digest("8"),
        }) as never,
        inspectOperationalContext: async () => {
          approvalInspections += 1;
          throw new Error("Current Work must not grant readiness");
        },
        loadPredecessorEvidence: async () => ({
          binding: {
            runId: currentProjection.runId,
            inputDigest: currentProjection.inputDigest,
            projectionDigest,
            projectionFileDigest: digest("7"),
            currentnessFileDigest: digest("8"),
          },
          taskMapInput: {
            pointers: [],
            events: [],
          },
        }) as never,
      },
    );
    assert.deepEqual(response.readyTaskIds, []);
    assert.deepEqual(response.readyProofTargets, []);
    assert.equal(approvalInspections, 0);
  } finally {
    await rm(value.ownerRoot, { recursive: true, force: true });
  }
});

function approvedPackage(
  options: {
    taskId?: string;
    rootId?: string;
    runId?: string;
    inputDigest?: string;
    generatedAt?: string;
    projectionDigest?: string;
    projectionFileDigest?: string;
    currentnessFileDigest?: string;
  } = {},
): TaskMapLocalExecutionPackageV1 {
  const core = {
    contractVersion: "taskmap-local-execution-package.v1" as const,
    approvalAuthorizationId: `tmlocalauthorization_${digest("5")}`,
    approvalAuthorizationDigest: digest("5"),
    localOwnerScopeDigest: OWNER_SCOPE,
    proofDigest: digest("6"),
    quartet: {
      runId: options.runId ?? "tmrun_completion",
      inputDigest: options.inputDigest ?? digest("b"),
      generatedAt: options.generatedAt ?? GENERATED_AT,
      projectionDigest: options.projectionDigest ?? digest("c"),
      projectionFileDigest: options.projectionFileDigest ?? digest("7"),
      currentnessFileDigest:
        options.currentnessFileDigest ?? digest("8"),
      currentWorkFileDigest: digest("9"),
      bodyFileDigest: digest("0"),
      bodyAssessmentFileDigest: digest("a"),
      bodyAssessmentArtifactDigest: digest("b"),
      physiologicalSnapshotDigest: digest("c"),
      currentWorkArtifactDigest: digest("d"),
    },
    task: {
      taskId: options.taskId ?? TASK_ID,
      rootId: options.rootId ?? ROOT_ID,
    },
    executionBoundary: {
      state: "prepared_not_started" as const,
      approvalRecorded: true as const,
      deliveryStatus: "not_started" as const,
      taskStarted: false as const,
      taskExecuted: false as const,
      dispatchAuthorized: false as const,
      sourceWritebackAuthorized: false as const,
      codexTaskStartAuthorized: false as const,
    },
    privacy: {
      sourceBodiesStored: false as const,
      localPathsStored: false as const,
      rawBiometricsStored: false as const,
      ownerIdentityStored: false as const,
    },
  };
  const packageDigest = taskMapContractDigest({
    domain: "taskmap-local-execution-package.1",
    ...core,
  });
  return {
    ...core,
    packageId: `tmlocalpackage_${packageDigest}`,
    packageDigest,
  } as unknown as TaskMapLocalExecutionPackageV1;
}

function projection(
  taskId = TASK_ID,
  sourceVersion = "revision-1",
  generatedAt = GENERATED_AT,
) {
  return {
    contractVersion: "taskmap.v1",
    runId: "tmrun_completion",
    inputDigest: digest("b"),
    generatedAt,
    roots: [{
      id: ROOT_ID,
      title: "Task Map product",
      taskIds: [taskId],
    }],
    tasks: [{
      id: taskId,
      rootId: ROOT_ID,
      title: "Complete the loop",
      reviewState: "accepted",
      openState: "open",
      taskHomePointerId: "ptr-strategy-taskmap-product-prototype",
      originPointerIds: [
        "ptr-codex-complete-loop",
        "ptr-strategy-taskmap-product-prototype",
      ],
      citations: [{
        eventId: "event-strategy-taskmap-product-prototype",
        pointerId: "ptr-strategy-taskmap-product-prototype",
        sourceKind: "strategy",
        sourceRefHash: digest("e"),
        occurredAt: "2026-07-30T08:01:00.000Z",
        extractionConfidence: 1,
      }],
    }],
    edges: [],
    sources: [{
      id: "ptr-strategy-taskmap-product-prototype",
      sourceKind: "strategy",
      sourceVersion,
    }],
  };
}

function strictMultiReadyProjection(): TaskMapProjectionV1 {
  const base = strictEmptyProofProjection();
  const template = base.tasks[0]!;
  const task = (
    taskId: string,
    pointerId: string,
    title: string,
  ): typeof template => ({
    ...structuredClone(template),
    id: taskId,
    rootId: POLICY_ROOT_ID,
    title,
    taskHomePointerId: pointerId,
    originPointerIds: [pointerId],
    returnRoute: {
      state: "source_owned",
      pointerId,
      requiresApproval: true,
    },
    citations: [{
      ...structuredClone(template.citations[0]!),
      eventId: `event-${taskId}`,
      pointerId,
    }],
  });
  const source = base.sources[0]!;
  return {
    ...base,
    runId: "tmrun_multi_ready_completion",
    generatedAt: GENERATED_AT,
    inputDigest: digest("b"),
    sources: [
      {
        ...structuredClone(source),
        id: POLICY_PRIMARY_POINTER_ID,
        sourceVersion: "linear-policy-primary.1",
      },
      {
        ...structuredClone(source),
        id: POLICY_SECONDARY_POINTER_ID,
        sourceVersion: "linear-policy-secondary.1",
      },
    ],
    roots: [{
      ...structuredClone(base.roots[0]!),
      id: POLICY_ROOT_ID,
      taskIds: [POLICY_PRIMARY_TASK_ID, POLICY_SECONDARY_TASK_ID],
      citations: [{
        ...structuredClone(base.roots[0]!.citations[0]!),
        pointerId: POLICY_PRIMARY_POINTER_ID,
      }],
    }],
    tasks: [
      task(
        POLICY_PRIMARY_TASK_ID,
        POLICY_PRIMARY_POINTER_ID,
        "Policy-ranked primary task",
      ),
      task(
        POLICY_SECONDARY_TASK_ID,
        POLICY_SECONDARY_POINTER_ID,
        "Policy-ranked secondary task",
      ),
    ],
  };
}

function readyProofTarget(
  projection: TaskMapProjectionV1,
  taskId: string,
): TaskMapReadyFrontierProofTargetV1 {
  const task = projection.tasks.find((candidate) => candidate.id === taskId)!;
  const pointerId = task.taskHomePointerId!;
  return {
    taskId,
    rootId: task.rootId,
    outcome: `Owner-visible result for ${taskId}.`,
    input: {
      summary: `Bounded input for ${taskId}.`,
      contextPointerIds: [pointerId],
    },
    predecessors: [],
    doneDefinition: [`Verify the bounded result for ${taskId}.`],
    permission: {
      requiresExplicitApproval: true,
      approvalGranted: false,
    },
    returnTarget: {
      state: "source_owned",
      pointerId,
    },
    executable: false,
    approvalPackage: {
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
    },
  };
}

async function fixture() {
  const ownerRoot = await realpath(
    await mkdtemp(
      path.join(tmpdir(), "taskmap-local-completion-cli-"),
    ),
  );
  await chmod(ownerRoot, 0o700);
  await mkdir(path.join(ownerRoot, "taskmap"), { mode: 0o700 });
  await mkdir(path.join(ownerRoot, "taskmap-local-execution"), {
    mode: 0o700,
  });
  const packagePath = path.join(
    ownerRoot,
    "taskmap-local-execution",
    "package.json",
  );
  await writeFile(
    packagePath,
    taskMapContractCanonicalJson(approvedPackage()),
    { mode: 0o600 },
  );
  let currentProjection = projection();
  const lifecycleContext = () => ({
    projection: currentProjection,
    currentness: {
      contractVersion: "taskmap-native-currentness-gate.v1",
      runId: currentProjection.runId,
      inputDigest: currentProjection.inputDigest,
      projectionDigest: digest("c"),
      taskDispositions: [{
        taskId: currentProjection.tasks[0]!.id,
        disposition: "current",
      }],
    },
    localOwnerScopeDigest: OWNER_SCOPE,
    projectionFileDigest: digest("7"),
    currentnessFileDigest: digest("8"),
  });
  const inspectOperationalContext = async () => ({
    inspection: {
      localOwnerScopeDigest: OWNER_SCOPE,
      quartet: {
        projectionFileDigest: digest("7"),
        currentnessFileDigest: digest("8"),
      },
    },
    response: {
      artifactAccess: { packagePath },
    },
    projection: currentProjection,
    currentness: {
      runId: currentProjection.runId,
      inputDigest: currentProjection.inputDigest,
      projectionDigest: digest("c"),
      taskDispositions: [{
        taskId: currentProjection.tasks[0]!.id,
        disposition: "current",
      }],
    },
    context: {},
  }) as never;
  const inspectExecution = async ():
    Promise<TaskMapAgentExecutionInspectionV1> => {
    const executionPackage = approvedPackage();
    return {
      contractVersion: "taskmap-agent-execution-inspection.v1",
      sessionId: SESSION_ID,
      progressState: "report_ready",
      sessionStatus: "finished",
      packageId: executionPackage.packageId,
      packageDigest: executionPackage.packageDigest,
      preflightId: null,
      preflightDigest: null,
      corePreflightId: null,
      corePreflightDigest: null,
      runtimeRequestDigest: null,
      startIdempotencyKey: null,
      taskId: TASK_ID,
      rootId: ROOT_ID,
      workspaceBindingDigest: digest("2"),
      launchedAdapter: "claude_code",
      startedAt: "2026-07-30T08:02:00.000Z",
      finishedAt: "2026-07-30T08:03:00.000Z",
      artifactCount: 1,
      artifactReceiptDigest: digest("3"),
      reportReceiptDigest: digest("4"),
      reportRelativePaths: ["report.md", "report.html"],
      sourceWritebackAttempted: false,
      sourceCompletion: false,
      outcomeVerified: false,
    };
  };
  const dependencies = {
    environment: {
      [TASKMAP_LOCAL_COMPLETION_CLI_TEST_MODE_ENV]: "1",
    },
    inspectOperationalContext,
    inspectLifecycleContext: async () => lifecycleContext() as never,
    inspectExecution,
  };
  const common = [
    "--test-owner-root", ownerRoot,
    "--task-id", TASK_ID,
    "--session-id", SESSION_ID,
    "--decided-at", DECIDED_AT,
  ];
  return {
    ownerRoot,
    dependencies,
    common,
    setProjection(value: ReturnType<typeof projection>) {
      currentProjection = value;
    },
  };
}

async function multiReadyFixture() {
  const ownerRoot = await realpath(
    await mkdtemp(
      path.join(tmpdir(), "taskmap-local-completion-multi-ready-"),
    ),
  );
  await chmod(ownerRoot, 0o700);
  const taskMapRoot = path.join(ownerRoot, "taskmap");
  const localExecutionRoot = path.join(
    ownerRoot,
    "taskmap-local-execution",
  );
  await mkdir(taskMapRoot, { mode: 0o700 });
  await mkdir(localExecutionRoot, { mode: 0o700 });

  const projection = strictMultiReadyProjection();
  const projectionDigest = diffTaskMapProjections(
    null,
    projection,
  ).currentProjectionDigest;
  const currentness = {
    contractVersion: "taskmap-native-currentness-gate.v1" as const,
    runId: projection.runId,
    inputDigest: projection.inputDigest,
    projectionDigest,
    taskDispositions: projection.tasks.map((task) => ({
      taskId: task.id,
      disposition: "current" as const,
    })),
  };
  const proofTargets = [
    readyProofTarget(projection, POLICY_PRIMARY_TASK_ID),
    readyProofTarget(projection, POLICY_SECONDARY_TASK_ID),
  ];
  const published = buildTaskMapReadyProofTargets({
    projection,
    currentness,
    proofTargets,
  });
  await writeFile(
    path.join(taskMapRoot, "taskmap-ready-proof-targets.v1.json"),
    taskMapContractCanonicalJson(published),
    { mode: 0o600 },
  );

  const projectionFileDigest = digest("7");
  const currentnessFileDigest = digest("8");
  const selectedPackage = approvedPackage({
    taskId: POLICY_SECONDARY_TASK_ID,
    rootId: POLICY_ROOT_ID,
    runId: projection.runId,
    inputDigest: projection.inputDigest,
    generatedAt: projection.generatedAt,
    projectionDigest,
    projectionFileDigest,
    currentnessFileDigest,
  });
  const packagePath = path.join(
    localExecutionRoot,
    "secondary-local-approval-package.json",
  );
  await writeFile(
    packagePath,
    taskMapContractCanonicalJson(selectedPackage),
    { mode: 0o600 },
  );

  const approvalTaskIds: Array<string | undefined> = [];
  const executionInspection: TaskMapAgentExecutionInspectionV1 = {
    contractVersion: "taskmap-agent-execution-inspection.v1",
    sessionId: SESSION_ID,
    progressState: "report_ready",
    sessionStatus: "finished",
    packageId: selectedPackage.packageId,
    packageDigest: selectedPackage.packageDigest,
    preflightId: null,
    preflightDigest: null,
    corePreflightId: null,
    corePreflightDigest: null,
    runtimeRequestDigest: null,
    startIdempotencyKey: null,
    taskId: POLICY_SECONDARY_TASK_ID,
    rootId: POLICY_ROOT_ID,
    workspaceBindingDigest: digest("2"),
    launchedAdapter: "claude_code",
    startedAt: "2026-07-30T08:02:00.000Z",
    finishedAt: "2026-07-30T08:03:00.000Z",
    artifactCount: 1,
    artifactReceiptDigest: digest("3"),
    reportReceiptDigest: digest("4"),
    reportRelativePaths: ["report.md", "report.html"],
    sourceWritebackAttempted: false,
    sourceCompletion: false,
    outcomeVerified: false,
  };
  const dependencies = {
    environment: {
      [TASKMAP_LOCAL_COMPLETION_CLI_TEST_MODE_ENV]: "1",
    },
    inspectLifecycleContext: async () => ({
      projection,
      currentness,
      localOwnerScopeDigest: OWNER_SCOPE,
      projectionFileDigest,
      currentnessFileDigest,
    }) as never,
    loadPredecessorEvidence: async (input: { homeDirectory: string }) => {
      assert.equal(input.homeDirectory, ownerRoot);
      return {
        binding: {
          runId: projection.runId,
          inputDigest: projection.inputDigest,
          projectionDigest,
          projectionFileDigest,
          currentnessFileDigest,
        },
        taskMapInput: {
          pointers: [],
          events: [
            {
              pointerId: POLICY_PRIMARY_POINTER_ID,
              deadlineAt: "2026-07-30T09:00:00.000Z",
            },
            {
              pointerId: POLICY_SECONDARY_POINTER_ID,
              deadlineAt: "2026-08-20T09:00:00.000Z",
            },
          ],
        },
      } as never;
    },
    inspectOperationalContext: async (input: {
      taskMapRoot: string;
      ownerRoot: string;
      taskId?: string;
    }) => {
      assert.equal(input.taskMapRoot, taskMapRoot);
      assert.equal(input.ownerRoot, ownerRoot);
      approvalTaskIds.push(input.taskId);
      return {
        inspection: {
          localOwnerScopeDigest: OWNER_SCOPE,
          quartet: {
            projectionFileDigest,
            currentnessFileDigest,
          },
          task: {
            taskId: POLICY_SECONDARY_TASK_ID,
            rootId: POLICY_ROOT_ID,
          },
        },
        response: {
          artifactAccess: { packagePath },
        },
        projection,
        currentness,
        context: {},
      } as never;
    },
    inspectExecution: async (executionRoot: string, sessionId: string) => {
      assert.equal(
        executionRoot,
        path.join(ownerRoot, "taskmap-agent-execution"),
      );
      assert.equal(sessionId, SESSION_ID);
      return executionInspection;
    },
  };
  return {
    ownerRoot,
    dependencies,
    approvalTaskIds,
    proofTargets,
    common: [
      "--test-owner-root", ownerRoot,
      "--task-id", POLICY_SECONDARY_TASK_ID,
      "--session-id", SESSION_ID,
      "--decided-at", DECIDED_AT,
    ],
  };
}

describe("Task Map local completion CLI", () => {
  it("treats an absent local-execution root as empty history in overlay reads", async () => {
    const value = await fixture();
    try {
      await rm(path.join(value.ownerRoot, "taskmap-local-execution"), {
        recursive: true,
        force: true,
      });
      const overlay = await runTaskMapLocalCompletionCli(
        ["overlay", "--test-owner-root", value.ownerRoot],
        value.dependencies,
      );
      assert.equal(overlay.status, "overlay");
      assert.deepEqual(overlay.closedTaskIds, []);
      assert.deepEqual(overlay.closedExecutionHistory, []);
    } finally {
      await rm(value.ownerRoot, { recursive: true, force: true });
    }
  });

  it("fits the maximum sealed history inside the bounded response envelope", async () => {
    const value = await fixture();
    try {
      const overlay = await runTaskMapLocalCompletionCli(
        ["inspect-overlay", "--test-owner-root", value.ownerRoot],
        value.dependencies,
      );
      const maximumHistory = Array.from(
        { length: TASKMAP_LOCAL_COMPLETION_MAX_TERMINAL_TASKS },
        (_, index) => {
          const closeDecisionDigest = index.toString(16).padStart(64, "0");
          return {
            taskId: `tmt_${index.toString(16).padStart(4, "0")}${"t".repeat(24)}`,
            rootId: `tmr_${"r".repeat(256)}`,
            sessionId:
              `11111111-1111-4111-8111-${index.toString(16).padStart(12, "0")}`,
            closeDecisionId: `tmlocalclose_${closeDecisionDigest}`,
            closeDecisionDigest,
            closedAt: new Date(
              Date.parse(DECIDED_AT) - index * 1_000,
            ).toISOString(),
            projectionDigest: digest("c"),
          };
        },
      );
      const output = taskMapLocalCompletionCliOutput({
        ...overlay,
        closedExecutionHistory: maximumHistory,
      });
      assert.ok(
        Buffer.byteLength(output, "utf8")
          <= TASKMAP_LOCAL_COMPLETION_CLI_MAX_OUTPUT_BYTES,
      );
      assert.throws(
        () => taskMapLocalCompletionCliOutput({
          ...overlay,
          closedExecutionHistory: [
            ...maximumHistory,
            {
              ...maximumHistory[0]!,
              taskId: `tmt_0100${"t".repeat(24)}`,
              sessionId: "11111111-1111-4111-8111-000000000100",
              closeDecisionId: `tmlocalclose_${digest("f")}`,
              closeDecisionDigest: digest("f"),
              closedAt: new Date(
                Date.parse(DECIDED_AT)
                  - TASKMAP_LOCAL_COMPLETION_MAX_TERMINAL_TASKS * 1_000,
              ).toISOString(),
            },
          ],
        }),
        /Task Map local completion CLI unavailable/,
      );
    } finally {
      await rm(value.ownerRoot, { recursive: true, force: true });
    }
  });

  it("quarantines a legacy-overlap task without attributing it to the current owner", async () => {
    const value = await multiReadyFixture();
    const dependencies = {
      ...value.dependencies,
      legacyQuarantinedTaskIdsForTest: [POLICY_PRIMARY_TASK_ID],
    };
    try {
      const overlay = await runTaskMapLocalCompletionCli(
        ["inspect-overlay", "--test-owner-root", value.ownerRoot],
        dependencies,
      );

      // The legacy terminal is not current-owner terminal authority, and it
      // cannot relight itself or unlock another executable leaf.
      assert.deepEqual(overlay.closedTaskIds, []);
      assert.deepEqual(overlay.closedExecutionHistory, []);
      assert.deepEqual(overlay.completedElsewhereTaskIds, []);
      assert.deepEqual(overlay.conflictedTaskIds, []);
      assert.deepEqual(overlay.terminalTaskIds, []);
      assert.deepEqual(overlay.readyTaskIds, []);
      assert.deepEqual(overlay.readyProofTargets, []);
      assert.equal(overlay.readyFrontierDigest, null);

      await assert.rejects(
        runTaskMapLocalCompletionCli(
          [
            "complete-elsewhere",
            "--test-owner-root", value.ownerRoot,
            "--task-id", POLICY_PRIMARY_TASK_ID,
            "--decided-at", DECIDED_AT,
          ],
          dependencies,
        ),
        (error: unknown) => (
          error instanceof Error
          && error.name === "TaskMapLegacyLocalStateQuarantineError"
          && (error as Error & { code?: string }).code
            === "TASKMAP_LEGACY_LOCAL_STATE_QUARANTINED"
        ),
      );
      await assert.rejects(
        lstat(path.join(
          value.ownerRoot,
          "taskmap-local-execution",
          "completion-decisions",
        )),
        { code: "ENOENT" },
      );
    } finally {
      await rm(value.ownerRoot, { recursive: true, force: true });
    }
  });

  it("preserves non-lexical policy-ranked ready order with exact proof-target validation", async () => {
    const value = await multiReadyFixture();
    try {
      const ranked = await runTaskMapLocalCompletionCli(
        ["inspect-overlay", "--test-owner-root", value.ownerRoot],
        value.dependencies,
      );
      assert.deepEqual(ranked.readyTaskIds, [
        POLICY_PRIMARY_TASK_ID,
        POLICY_SECONDARY_TASK_ID,
      ]);
      assert.deepEqual(
        ranked.readyProofTargets.map((target) => target.taskId),
        ranked.readyTaskIds,
      );
      const encoded = JSON.parse(
        taskMapLocalCompletionCliOutput(ranked),
      ) as { readyTaskIds: string[] };
      assert.deepEqual(encoded.readyTaskIds, ranked.readyTaskIds);

      assert.throws(
        () => taskMapLocalCompletionCliOutput({
          ...ranked,
          readyProofTargets: [...ranked.readyProofTargets].reverse(),
        }),
        /Task Map local completion CLI unavailable/,
      );
      assert.throws(
        () => taskMapLocalCompletionCliOutput({
          ...ranked,
          readyTaskIds: [
            POLICY_PRIMARY_TASK_ID,
            POLICY_PRIMARY_TASK_ID,
          ],
          readyProofTargets: [
            ranked.readyProofTargets[0]!,
            {
              ...structuredClone(ranked.readyProofTargets[1]!),
              taskId: POLICY_PRIMARY_TASK_ID,
            },
          ],
        }),
        /Task Map local completion CLI unavailable/,
      );
      const overlongTaskId = `tmt_${"x".repeat(29)}`;
      assert.throws(
        () => taskMapLocalCompletionCliOutput({
          ...ranked,
          readyTaskIds: [overlongTaskId],
          readyProofTargets: [{
            ...structuredClone(ranked.readyProofTargets[0]!),
            taskId: overlongTaskId,
          }],
        }),
        /Task Map local completion CLI unavailable/,
      );
    } finally {
      await rm(value.ownerRoot, { recursive: true, force: true });
    }
  });

  it("reviews and closes a secondary ready leaf through its selected approval context", async () => {
    const value = await multiReadyFixture();
    try {
      const review = await runTaskMapLocalCompletionCli(
        ["review", ...value.common],
        value.dependencies,
      );
      assert.equal(review.status, "awaiting_review");
      assert.equal(review.taskId, POLICY_SECONDARY_TASK_ID);
      assert.equal(review.canClose, true);
      assert.deepEqual(review.readyTaskIds, [
        POLICY_PRIMARY_TASK_ID,
        POLICY_SECONDARY_TASK_ID,
      ]);

      const closed = await runTaskMapLocalCompletionCli(
        ["close", ...value.common],
        value.dependencies,
      );
      assert.equal(closed.status, "closed_in_daobrew");
      assert.equal(closed.taskId, POLICY_SECONDARY_TASK_ID);
      assert.deepEqual(closed.closedTaskIds, [POLICY_SECONDARY_TASK_ID]);
      assert.deepEqual(closed.readyTaskIds, [POLICY_PRIMARY_TASK_ID]);
      assert.deepEqual(value.approvalTaskIds, [
        POLICY_SECONDARY_TASK_ID,
        POLICY_SECONDARY_TASK_ID,
      ]);
    } finally {
      await rm(value.ownerRoot, { recursive: true, force: true });
    }
  });

  it("freezes the exact closed-execution binding digest and its tamper vector", () => {
    assert.equal(
      taskMapLocalCompletionClosedExecutionBindingDigest(
        CLOSED_EXECUTION_BINDING_VECTOR,
      ),
      CLOSED_EXECUTION_BINDING_VECTOR_DIGEST,
    );
    const tamperedDigest =
      taskMapLocalCompletionClosedExecutionBindingDigest({
        ...CLOSED_EXECUTION_BINDING_VECTOR,
        reportReceiptDigest: digest("6"),
      });
    assert.equal(
      tamperedDigest,
      "10fe7f6cb4b335bf2bf7ef204bcb5592ee11a3e2d0b3d5da74544e7358a39054",
    );
    assert.notEqual(
      tamperedDigest,
      CLOSED_EXECUTION_BINDING_VECTOR_DIGEST,
    );
  });

  it("persists explicit Close and derives an anti-resurrection overlay", async () => {
    const value = await fixture();
    try {
      const close = await runTaskMapLocalCompletionCli(
        ["close", ...value.common],
        value.dependencies,
      );
      assert.equal(close.status, "closed_in_daobrew");
      assert.deepEqual(close.closedTaskIds, [TASK_ID]);
      assert.equal(close.closedExecutionBindingDigest, null);
      assert.equal(close.sourceCompletion, false);

      const decisions = await readdir(path.join(
        value.ownerRoot,
        "taskmap-local-execution",
        "completion-decisions",
      ));
      assert.equal(decisions.length, 1);
      const bytes = await readFile(path.join(
        value.ownerRoot,
        "taskmap-local-execution",
        "completion-decisions",
        decisions[0]!,
      ));
      assert.match(bytes.toString("utf8"), /"closed_in_daobrew"/);

      await assert.rejects(
        runTaskMapLocalCompletionCli(
          [
            "complete-elsewhere",
            "--test-owner-root", value.ownerRoot,
            "--task-id", TASK_ID,
            "--decided-at", "2026-07-30T08:05:00.000Z",
          ],
          value.dependencies,
        ),
        /active terminal disposition; explicit Reopen is required/,
      );
      assert.equal((await readdir(path.join(
        value.ownerRoot,
        "taskmap-local-execution",
        "completion-decisions",
      ))).length, 1);

      value.setProjection(projection("tmt_refreshed_alias"));
      const overlay = await runTaskMapLocalCompletionCli(
        ["overlay", "--test-owner-root", value.ownerRoot],
        value.dependencies,
      );
      assert.deepEqual(overlay.closedTaskIds, ["tmt_refreshed_alias"]);

      value.setProjection(
        projection(
          "tmt_authoritative_revision",
          "revision-2",
          "2026-07-30T09:00:00.000Z",
        ),
      );
      const conflict = await runTaskMapLocalCompletionCli(
        ["overlay", "--test-owner-root", value.ownerRoot],
        value.dependencies,
      );
      assert.deepEqual(
        conflict.conflictedTaskIds,
        ["tmt_authoritative_revision"],
      );
      assert.deepEqual(conflict.closedTaskIds, []);
    } finally {
      await rm(value.ownerRoot, { recursive: true, force: true });
    }
  });

  it("inspects the exact report-ready execution behind an active closed disposition without writes or current approval", async () => {
    const value = await fixture();
    try {
      const closed = await runTaskMapLocalCompletionCli(
        ["close", ...value.common],
        value.dependencies,
      );
      const localExecutionRoot = path.join(
        value.ownerRoot,
        "taskmap-local-execution",
      );
      const decisionsRoot = path.join(
        localExecutionRoot,
        "completion-decisions",
      );
      const overlayPath = path.join(
        localExecutionRoot,
        "completion-overlay.v1.json",
      );
      const beforeOverlay = await stat(overlayPath);
      const beforeDecisions = await readdir(decisionsRoot);
      let approvalInspections = 0;
      let predecessorLoads = 0;
      let executionInspections = 0;

      const inspected = await runTaskMapLocalCompletionCli(
        [
          "inspect-closed-execution",
          "--test-owner-root", value.ownerRoot,
          "--task-id", TASK_ID,
        ],
        {
          ...value.dependencies,
          inspectOperationalContext: async () => {
            approvalInspections += 1;
            throw new Error("historical inspection must not read approval");
          },
          loadPredecessorEvidence: async () => {
            predecessorLoads += 1;
            throw new Error("historical inspection must not build frontier");
          },
          inspectExecution: async (executionRoot, sessionId) => {
            executionInspections += 1;
            assert.equal(
              executionRoot,
              path.join(value.ownerRoot, "taskmap-agent-execution"),
            );
            assert.equal(sessionId, SESSION_ID);
            return value.dependencies.inspectExecution();
          },
        },
      );

      assert.equal(inspected.status, "closed_in_daobrew");
      assert.equal(inspected.taskId, TASK_ID);
      assert.equal(inspected.rootId, ROOT_ID);
      assert.equal(inspected.sessionId, SESSION_ID);
      assert.equal(inspected.closeDecisionId, closed.closeDecisionId);
      const execution = await value.dependencies.inspectExecution();
      assert.equal(
        inspected.closedExecutionBindingDigest,
        taskMapLocalCompletionClosedExecutionBindingDigest({
          closeDecisionId: closed.closeDecisionId!,
          taskId: execution.taskId!,
          rootId: execution.rootId!,
          sessionId: execution.sessionId,
          packageId: execution.packageId!,
          packageDigest: execution.packageDigest!,
          workspaceBindingDigest: execution.workspaceBindingDigest!,
          launchedAdapter: execution.launchedAdapter!,
          startedAt: execution.startedAt!,
          finishedAt: execution.finishedAt!,
          artifactCount: execution.artifactCount,
          artifactReceiptDigest: execution.artifactReceiptDigest!,
          reportReceiptDigest: execution.reportReceiptDigest!,
          reportRelativePaths: execution.reportRelativePaths as [
            "report.md",
            "report.html",
          ],
        }),
      );
      assert.throws(
        () => taskMapLocalCompletionCliOutput({
          ...inspected,
          status: "overlay",
        }),
        /Task Map local completion CLI unavailable/,
      );
      assert.throws(
        () => taskMapLocalCompletionCliOutput({
          ...inspected,
          closedExecutionBindingDigest: "not-a-digest",
        }),
        /Task Map local completion CLI unavailable/,
      );
      assert.throws(
        () => taskMapLocalCompletionCliOutput({
          ...inspected,
          closedExecutionHistory: [],
        }),
        /Task Map local completion CLI unavailable/,
      );
      const activeOverlay = await runTaskMapLocalCompletionCli(
        ["inspect-overlay", "--test-owner-root", value.ownerRoot],
        value.dependencies,
      );
      assert.throws(
        () => taskMapLocalCompletionCliOutput({
          ...activeOverlay,
          closedExecutionHistory: [],
        }),
        /Task Map local completion CLI unavailable/,
      );
      assert.equal(inspected.canClose, false);
      assert.equal(inspected.canKeepOpen, false);
      assert.deepEqual(inspected.closedTaskIds, [TASK_ID]);
      assert.deepEqual(inspected.readyTaskIds, []);
      assert.equal(inspected.readyFrontierDigest, null);
      assert.equal(inspected.sourceWritebackAttempted, false);
      assert.equal(inspected.sourceCompletion, false);
      assert.equal(inspected.outcomeVerified, false);
      assert.equal(approvalInspections, 0);
      assert.equal(predecessorLoads, 0);
      assert.equal(executionInspections, 1);
      assert.deepEqual(await readdir(decisionsRoot), beforeDecisions);
      const afterOverlay = await stat(overlayPath);
      assert.equal(afterOverlay.ino, beforeOverlay.ino);
      assert.equal(afterOverlay.mtimeMs, beforeOverlay.mtimeMs);
    } finally {
      await rm(value.ownerRoot, { recursive: true, force: true });
    }
  });

  it("keeps sealed closed execution history inspectable and reopenable after a successor projection omits the task", async () => {
    const value = await fixture();
    try {
      const closed = await runTaskMapLocalCompletionCli(
        ["close", ...value.common],
        value.dependencies,
      );
      const successor = projection(
        "tmt_successor_work",
        "successor-revision-1",
        "2026-07-30T08:10:00.000Z",
      );
      const successorPointerId = "ptr-successor-owner-work";
      successor.tasks[0]!.taskHomePointerId = successorPointerId;
      successor.tasks[0]!.originPointerIds = [successorPointerId];
      successor.tasks[0]!.citations = [{
        ...successor.tasks[0]!.citations[0]!,
        eventId: "event-successor-owner-work",
        pointerId: successorPointerId,
      }];
      successor.sources[0] = {
        ...successor.sources[0]!,
        id: successorPointerId,
      };
      value.setProjection(successor);

      const overlay = await runTaskMapLocalCompletionCli(
        ["inspect-overlay", "--test-owner-root", value.ownerRoot],
        value.dependencies,
      );
      assert.deepEqual(overlay.closedTaskIds, []);
      assert.deepEqual(overlay.terminalTaskIds, []);
      assert.deepEqual(overlay.closedExecutionHistory, [{
        taskId: TASK_ID,
        rootId: ROOT_ID,
        sessionId: SESSION_ID,
        closeDecisionId: closed.closeDecisionId,
        closeDecisionDigest: closed.closeDecisionId!.slice(
          "tmlocalclose_".length,
        ),
        closedAt: DECIDED_AT,
        projectionDigest: digest("c"),
      }]);

      const inspected = await runTaskMapLocalCompletionCli(
        [
          "inspect-closed-execution",
          "--test-owner-root", value.ownerRoot,
          "--task-id", TASK_ID,
        ],
        value.dependencies,
      );
      assert.equal(inspected.taskId, TASK_ID);
      assert.equal(inspected.rootId, ROOT_ID);
      assert.equal(inspected.sessionId, SESSION_ID);
      assert.equal(inspected.closeDecisionId, closed.closeDecisionId);
      assert.equal(inspected.closedTaskIds.includes(TASK_ID), false);
      assert.equal(inspected.closedExecutionHistory.length, 1);
      assert.match(
        inspected.closedExecutionBindingDigest ?? "",
        /^[a-f0-9]{64}$/,
      );
      assert.throws(
        () => taskMapLocalCompletionCliOutput({
          ...inspected,
          closeDecisionId: `tmlocalclose_${digest("f")}`,
        }),
        /Task Map local completion CLI unavailable/,
      );

      const reopened = await runTaskMapLocalCompletionCli(
        [
          "reopen",
          "--test-owner-root", value.ownerRoot,
          "--task-id", TASK_ID,
          "--decided-at", "2026-07-30T08:11:00.000Z",
        ],
        value.dependencies,
      );
      assert.equal(reopened.status, "reopened");
      assert.equal(reopened.taskId, TASK_ID);
      assert.deepEqual(reopened.closedExecutionHistory, []);

      await assert.rejects(
        runTaskMapLocalCompletionCli(
          [
            "inspect-closed-execution",
            "--test-owner-root", value.ownerRoot,
            "--task-id", TASK_ID,
          ],
          value.dependencies,
        ),
        /Task Map local completion CLI unavailable/,
      );
    } finally {
      await rm(value.ownerRoot, { recursive: true, force: true });
    }
  });

  it("rejects a closed execution whose receipt binding differs from the sealed close decision", async () => {
    const value = await fixture();
    try {
      await runTaskMapLocalCompletionCli(
        ["close", ...value.common],
        value.dependencies,
      );
      const execution = await value.dependencies.inspectExecution();
      await assert.rejects(
        runTaskMapLocalCompletionCli(
          [
            "inspect-closed-execution",
            "--test-owner-root", value.ownerRoot,
            "--task-id", TASK_ID,
          ],
          {
            ...value.dependencies,
            inspectExecution: async () => ({
              ...execution,
              reportReceiptDigest: digest("f"),
            }),
          },
        ),
        /Task Map local completion CLI unavailable/,
      );
    } finally {
      await rm(value.ownerRoot, { recursive: true, force: true });
    }
  });

  it("rejects a tampered sealed close decision before inspecting its session", async () => {
    const value = await fixture();
    try {
      await runTaskMapLocalCompletionCli(
        ["close", ...value.common],
        value.dependencies,
      );
      const decisionsRoot = path.join(
        value.ownerRoot,
        "taskmap-local-execution",
        "completion-decisions",
      );
      const decisionPath = path.join(
        decisionsRoot,
        (await readdir(decisionsRoot))[0]!,
      );
      const tampered = JSON.parse(
        (await readFile(decisionPath)).toString("utf8"),
      ) as {
        binding: { report: { reportReceiptDigest: string } };
      };
      tampered.binding.report.reportReceiptDigest = digest("f");
      await writeFile(
        decisionPath,
        taskMapContractCanonicalJson(tampered),
      );
      let executionInspections = 0;

      await assert.rejects(
        runTaskMapLocalCompletionCli(
          [
            "inspect-closed-execution",
            "--test-owner-root", value.ownerRoot,
            "--task-id", TASK_ID,
          ],
          {
            ...value.dependencies,
            inspectExecution: async () => {
              executionInspections += 1;
              return value.dependencies.inspectExecution();
            },
          },
        ),
      );
      assert.equal(executionInspections, 0);
    } finally {
      await rm(value.ownerRoot, { recursive: true, force: true });
    }
  });

  it("rejects historical execution inspection after the matched close is reopened", async () => {
    const value = await fixture();
    try {
      await runTaskMapLocalCompletionCli(
        ["close", ...value.common],
        value.dependencies,
      );
      await runTaskMapLocalCompletionCli(
        [
          "reopen",
          "--test-owner-root", value.ownerRoot,
          "--task-id", TASK_ID,
          "--decided-at", "2026-07-30T08:05:00.000Z",
        ],
        value.dependencies,
      );
      let executionInspections = 0;

      await assert.rejects(
        runTaskMapLocalCompletionCli(
          [
            "inspect-closed-execution",
            "--test-owner-root", value.ownerRoot,
            "--task-id", TASK_ID,
          ],
          {
            ...value.dependencies,
            inspectExecution: async () => {
              executionInspections += 1;
              return value.dependencies.inspectExecution();
            },
          },
        ),
        /Task Map local completion CLI unavailable/,
      );
      assert.equal(executionInspections, 0);
    } finally {
      await rm(value.ownerRoot, { recursive: true, force: true });
    }
  });

  it("Keep open is nonterminal and parser rejects incomplete approval", async () => {
    const value = await fixture();
    try {
      const kept = await runTaskMapLocalCompletionCli(
        ["keep-open", ...value.common],
        value.dependencies,
      );
      assert.equal(kept.status, "kept_open");
      assert.deepEqual(kept.closedTaskIds, []);
      await assert.rejects(
        readdir(path.join(
          value.ownerRoot,
          "taskmap-local-execution",
          "completion-decisions",
        )),
      );
      assert.throws(() =>
        parseTaskMapLocalCompletionCliArguments([
          "close",
          "--task-id", TASK_ID,
        ])
      );
    } finally {
      await rm(value.ownerRoot, { recursive: true, force: true });
    }
  });

  it("records non-ready external completion without package or execution evidence and only explicit Reopen reactivates it", async () => {
    const value = await fixture();
    try {
      const unusedPackagePath = path.join(
        value.ownerRoot,
        "taskmap-local-execution",
        "package.json",
      );
      await rm(unusedPackagePath);
      await assert.rejects(lstat(unusedPackagePath), { code: "ENOENT" });
      const dependencies = {
        ...value.dependencies,
        inspectOperationalContext: async () => {
          throw new Error(
            "external completion must not inspect approval context",
          );
        },
        inspectExecution: async () => {
          throw new Error("external completion must not inspect execution");
        },
      };
      const before = await runTaskMapLocalCompletionCli(
        ["inspect-overlay", "--test-owner-root", value.ownerRoot],
        dependencies,
      );
      assert.deepEqual(before.readyTaskIds, []);
      assert.deepEqual(before.terminalTaskIds, []);
      const completed = await runTaskMapLocalCompletionCli(
        [
          "complete-elsewhere",
          "--test-owner-root", value.ownerRoot,
          "--task-id", TASK_ID,
          "--decided-at", DECIDED_AT,
        ],
        dependencies,
      );
      assert.equal(completed.status, "completed_elsewhere");
      assert.deepEqual(completed.completedElsewhereTaskIds, [TASK_ID]);
      assert.deepEqual(completed.terminalTaskIds, [TASK_ID]);
      assert.match(
        completed.completionDecisionId ?? "",
        /^tmlocalexternalcompletion_[a-f0-9]{64}$/,
      );
      assert.equal(completed.sessionId, null);
      assert.equal(completed.sourceWritebackAttempted, false);
      assert.equal(completed.sourceCompletion, false);
      assert.equal(completed.outcomeVerified, false);
      assert.deepEqual(completed.readyTaskIds, []);

      const decisionsRoot = path.join(
        value.ownerRoot,
        "taskmap-local-execution",
        "completion-decisions",
      );
      const firstDecision = JSON.parse(
        (await readFile(path.join(
          decisionsRoot,
          (await readdir(decisionsRoot))[0]!,
        ))).toString("utf8"),
      ) as Record<string, unknown>;
      assert.equal(firstDecision.displayState, "Completed by you");
      assert.equal(firstDecision.localOwnerScopeDigest, OWNER_SCOPE);
      assert.equal(firstDecision.sourceWritebackAttempted, false);
      assert.equal(firstDecision.sourceCompletion, false);
      assert.equal(firstDecision.outcomeVerified, false);
      assert.deepEqual(Object.keys(
        firstDecision.binding as Record<string, unknown>,
      ), ["projection"]);
      assert.equal("package" in firstDecision, false);
      assert.equal("session" in firstDecision, false);
      assert.equal("artifact" in firstDecision, false);
      assert.equal("report" in firstDecision, false);

      for (const command of [
        ["close", ...value.common],
        ["keep-open", ...value.common],
        [
          "complete-elsewhere",
          "--test-owner-root", value.ownerRoot,
          "--task-id", TASK_ID,
          "--decided-at", "2026-07-30T08:05:00.000Z",
        ],
      ]) {
        await assert.rejects(
          runTaskMapLocalCompletionCli(command, dependencies),
          /active terminal disposition; explicit Reopen is required/,
        );
      }
      assert.equal((await readdir(decisionsRoot)).length, 1);

      value.setProjection(
        projection(
          "tmt_repeated_source_text",
          "revision-2",
          "2026-07-30T09:00:00.000Z",
        ),
      );
      const repeated = await runTaskMapLocalCompletionCli(
        ["overlay", "--test-owner-root", value.ownerRoot],
        dependencies,
      );
      assert.deepEqual(
        repeated.completedElsewhereTaskIds,
        ["tmt_repeated_source_text"],
      );
      assert.deepEqual(repeated.conflictedTaskIds, []);

      await assert.rejects(
        runTaskMapLocalCompletionCli(
          [
            "close",
            "--test-owner-root", value.ownerRoot,
            "--task-id", "tmt_repeated_source_text",
            "--session-id", SESSION_ID,
            "--decided-at", "2026-07-30T09:00:30.000Z",
          ],
          dependencies,
        ),
        /active terminal disposition; explicit Reopen is required/,
      );
      assert.equal((await readdir(decisionsRoot)).length, 1);

      const reopened = await runTaskMapLocalCompletionCli(
        [
          "reopen",
          "--test-owner-root", value.ownerRoot,
          "--task-id", "tmt_repeated_source_text",
          "--decided-at", "2026-07-30T09:01:00.000Z",
        ],
        dependencies,
      );
      assert.equal(reopened.status, "reopened");
      assert.deepEqual(reopened.terminalTaskIds, []);
      assert.match(
        reopened.reopenDecisionId ?? "",
        /^tmlocalexternalreopen_[a-f0-9]{64}$/,
      );
      assert.equal((await readdir(decisionsRoot)).length, 2);

      const afterReopen = await runTaskMapLocalCompletionCli(
        ["inspect-overlay", "--test-owner-root", value.ownerRoot],
        dependencies,
      );
      assert.deepEqual(afterReopen.terminalTaskIds, []);
      assert.deepEqual(afterReopen.completedElsewhereTaskIds, []);
    } finally {
      await rm(value.ownerRoot, { recursive: true, force: true });
    }
  });

  it("inspects a new overlay without rewriting the derived cache", async () => {
    const value = await fixture();
    try {
      await runTaskMapLocalCompletionCli(
        ["close", ...value.common],
        value.dependencies,
      );
      const overlayPath = path.join(
        value.ownerRoot,
        "taskmap-local-execution",
        "completion-overlay.v1.json",
      );
      const before = await readFile(overlayPath);

      value.setProjection(projection("tmt_refreshed_alias"));
      const inspected = await runTaskMapLocalCompletionCli(
        ["inspect-overlay", "--test-owner-root", value.ownerRoot],
        value.dependencies,
      );

      assert.deepEqual(inspected.closedTaskIds, ["tmt_refreshed_alias"]);
      assert.deepEqual(await readFile(overlayPath), before);
    } finally {
      await rm(value.ownerRoot, { recursive: true, force: true });
    }
  });

  it("treats only an absent lifecycle history directory as empty", async () => {
    const value = await fixture();
    const decisionsRoot = path.join(
      value.ownerRoot,
      "taskmap-local-execution",
      "completion-decisions",
    );
    try {
      const absent = await runTaskMapLocalCompletionCli(
        ["overlay", "--test-owner-root", value.ownerRoot],
        value.dependencies,
      );
      assert.deepEqual(absent.closedTaskIds, []);

      await mkdir(decisionsRoot, { mode: 0o755 });
      await assert.rejects(
        runTaskMapLocalCompletionCli(
          ["overlay", "--test-owner-root", value.ownerRoot],
          value.dependencies,
        ),
        /Task Map local completion CLI unavailable/,
      );
    } finally {
      await rm(value.ownerRoot, { recursive: true, force: true });
    }
  });
});
