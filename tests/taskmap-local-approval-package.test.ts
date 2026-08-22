import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { buildTaskMapBodyContextDisclosure } from "../src/engine/taskmap/body-context.js";
import {
  inspectTaskMapAgentHandoff,
  TASKMAP_AGENT_HANDOFF_LIMITS_V1,
  TASKMAP_AGENT_HANDOFF_MANIFEST_VERSION,
  TASKMAP_AGENT_HANDOFF_RUNTIME_REQUEST_V1,
  TASKMAP_AGENT_HANDOFF_SUMMARY_VERSION,
} from "../src/engine/taskmap/agent-handoff-manifest.js";
import {
  parseTaskMapAgentHandoffCliArguments,
  runTaskMapAgentHandoffCli,
  taskMapAgentHandoffCliOutput,
  TASKMAP_AGENT_HANDOFF_TEST_MODE_ENV,
} from "../src/engine/taskmap/agent-handoff-manifest-cli.js";
import {
  buildTaskMapProjection,
  taskMapSemanticInputDigest,
} from "../src/engine/taskmap/harness.js";
import {
  approveAndPrepareTaskMapLocalPackage,
  deriveTaskMapLocalOwnerScopeDigest,
  inspectTaskMapLocalApproval,
  inspectTaskMapLocalLifecycleContext,
  TASKMAP_FIXED_ARTIFACT_NAMES,
  TASKMAP_READY_PROOF_TARGETS_FILENAME,
  type TaskMapLocalExecutionPackageV1,
  type TaskMapLocalPreparationReceiptV1,
} from "../src/engine/taskmap/local-approval-package.js";
import {
  parseTaskMapLocalApprovalCliArguments,
  runTaskMapLocalApprovalCli,
  taskMapLocalApprovalCliOutput,
} from "../src/engine/taskmap/local-approval-package-cli.js";
import {
  runTaskMapLocalCompletionCli,
} from "../src/engine/taskmap/local-completion-cli.js";
import {
  diffTaskMapProjections,
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "../src/engine/taskmap/source-contracts.js";
import {
  buildTaskMapReadyProofTargets,
  type TaskMapReadyFrontierProofTargetV1,
} from "../src/engine/taskmap/ready-frontier.js";
import {
  TASKMAP_BODY_SIGNAL_ASSESSMENT_VERSION,
  TASKMAP_BODY_SIGNAL_WORK_SOURCE_LABEL_BY_KIND,
  type TaskMapBodySignalAssessmentV1,
} from "../src/engine/taskmap/native-refresh-service.js";
import type {
  TaskMapNativeCurrentnessForWorkV1,
  TaskMapNativeCurrentWorkV1,
} from "../src/engine/taskmap/native-current-work-successor.js";
import {
  TASKMAP_CONTRACT_VERSION,
  type SemanticBrainOutput,
  type TaskMapInput,
  type TaskMapProjectionV1,
} from "../src/engine/taskmap/types.js";
import {
  TASKMAP_WEDNESDAY_DEMO_BINDING,
  TASKMAP_WEDNESDAY_DEMO_COPY,
} from "../src/engine/taskmap/wednesday-demo-leaf.js";
import { confirmedTestOwner } from "./support/confirmed-owner.js";

const GENERATED_AT = "2026-07-29T12:00:00.000Z";
const AUTHORIZED_AT = "2026-07-29T12:05:00.000Z";

function invokeCliMain(entrypointName: string, argv: readonly string[]) {
  const entrypoint = path.resolve(
    __dirname,
    `../src/engine/taskmap/${entrypointName}.js`,
  );
  return spawnSync(process.execPath, [entrypoint, ...argv], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

it("preserves local-approval failure bytes without echoing invalid argv", () => {
  const unreflectedArgument = "PRIVATE_LOCAL_APPROVAL_ARGUMENT";
  const result = invokeCliMain("local-approval-package-cli", [unreflectedArgument]);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(
    result.stderr,
    /^taskmap-local-approval: unavailable\nError: Task Map local approval CLI input is invalid/m,
  );
  assert.match(result.stderr, /at fail/);
  assert.equal(result.stderr.includes(unreflectedArgument), false);
});

it("preserves agent-handoff failure bytes without echoing invalid argv", () => {
  const unreflectedArgument = "PRIVATE_AGENT_HANDOFF_ARGUMENT";
  const result = invokeCliMain("agent-handoff-manifest-cli", [unreflectedArgument]);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(
    result.stderr,
    /^taskmap-agent-handoff: unavailable\nError: Task Map agent handoff CLI input is invalid/m,
  );
  assert.match(result.stderr, /at fail/);
  assert.equal(result.stderr.includes(unreflectedArgument), false);
});

it("resolves product approval storage from the confirmed owner only", () => {
  const owner = confirmedTestOwner("local-approval-product-owner");
  const parsed = parseTaskMapLocalApprovalCliArguments(
    ["inspect"],
    {
      homeDirectory: owner.homeDirectory,
      environment: { DAOBREW_USER_ID: owner.userId },
    },
  );
  assert.equal(parsed.roots.ownerRoot, owner.ownerRoot);
  assert.equal(
    parsed.roots.taskMapRoot,
    path.join(owner.ownerRoot, "taskmap"),
  );
  assert.throws(
    () => parseTaskMapLocalApprovalCliArguments(
      ["inspect"],
      {
        homeDirectory: owner.homeDirectory,
        environment: {
          DAOBREW_USER_ID: "00000000-0000-4000-8000-000000000000",
        },
      },
    ),
    /Task Map local approval CLI input is invalid/,
  );
});

it("quarantines private legacy terminal state instead of approving it under a fresh owner", async () => {
  const owner = confirmedTestOwner(
    "local-approval-legacy-terminal-quarantine",
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
    "legacy-close.json",
  );
  const legacyBytes = Buffer.from("{\"legacyTerminal\":true}\n", "utf8");
  await rm(owner.ownerRoot, { recursive: true, force: true });
  await mkdir(legacyDecisionsRoot, { recursive: true, mode: 0o700 });
  await chmod(legacyExecutionRoot, 0o700);
  await chmod(legacyDecisionsRoot, 0o700);
  await writeFile(legacyDecisionPath, legacyBytes, { mode: 0o600 });
  try {
    await assert.rejects(
      runTaskMapLocalApprovalCli(
        [
          "approve-prepare",
          "--expected-owner-scope-digest", "a".repeat(64),
          "--expected-proof-digest", "b".repeat(64),
          "--task-id", "tmt_0000000000000001",
          "--idempotency-key", "c".repeat(64),
          "--authorized-at", AUTHORIZED_AT,
        ],
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
    assert.deepEqual(await readFile(legacyDecisionPath), legacyBytes);
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

interface Fixture {
  base: string;
  ownerRoot: string;
  taskMapRoot: string;
  executionRoot: string;
  projection: TaskMapProjectionV1;
  targetTaskId: string;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function inputFixture(): TaskMapInput {
  return {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    generatedAt: GENERATED_AT,
    pointers: [
      {
        id: TASKMAP_WEDNESDAY_DEMO_BINDING.taskHomePointerId,
        sourceKind: "manual",
        sourceObjectId: "task-safe-ref",
        sourceRefHash: "0000000000000000",
        sourceVersion: "taskmap-demo-rally.2026-07-31.1",
        authority: "user",
        syncMode: "personal_fork",
        capabilities: ["read_task", "update_status"],
      },
      {
        id: TASKMAP_WEDNESDAY_DEMO_BINDING.requestPointerId,
        sourceKind: "manual",
        sourceObjectId: "codex-request-safe-ref",
        sourceRefHash: "1111111111111111",
        authority: "user",
        syncMode: "personal_fork",
        capabilities: ["read_task"],
      },
      {
        id: "body-context",
        sourceKind: "oura",
        sourceObjectId: "relative-window",
        sourceRefHash: "2222222222222222",
        authority: "none",
        syncMode: "reference_only",
        capabilities: ["read_context"],
      },
    ],
    events: [
      {
        id: "task-created",
        pointerId: TASKMAP_WEDNESDAY_DEMO_BINDING.taskHomePointerId,
        recordKind: "authoritative_task",
        activity: "task_created",
        occurredAt: "2026-07-28T10:00:00.000Z",
        observedAt: GENERATED_AT,
        objectRefs: ["task:safe-ref"],
        title: TASKMAP_WEDNESDAY_DEMO_COPY.leafTitle,
        summary: "Package the Odyssey attention-management demo without starting delivery.",
        extractionConfidence: 1,
        sourceStatus: "open",
      },
      {
        id: "meeting-context-event",
        pointerId: TASKMAP_WEDNESDAY_DEMO_BINDING.requestPointerId,
        recordKind: "work_context",
        activity: "context_observed",
        occurredAt: "2026-07-29T10:00:00.000Z",
        observedAt: GENERATED_AT,
        dayKey: "2026-07-29",
        objectRefs: ["context:odyssey-debate"],
        title: "Odyssey attention-management package request",
        summary: TASKMAP_WEDNESDAY_DEMO_COPY.leafTitle,
        extractionConfidence: 1,
        bodyJoinEligible: true,
      },
      {
        id: "body-context-event",
        pointerId: "body-context",
        recordKind: "body_context",
        activity: "body_window_observed",
        occurredAt: "2026-07-29T09:00:00.000Z",
        observedAt: GENERATED_AT,
        dayKey: "2026-07-29",
        objectRefs: ["body-day:2026-07-29"],
        title: "Relative body context",
        summary: "Provider-specific raw values are not stored.",
        extractionConfidence: 1,
        bodyCategory: "below_baseline",
        bodyAxis: "composite_recovery",
      },
    ],
  };
}

function brainFixture(input: TaskMapInput): SemanticBrainOutput {
  return {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    provider: "codex",
    model: "gpt-5.6-sol",
    promptHash: "aaaaaaaaaaaaaaaa",
    inputDigest: taskMapSemanticInputDigest(input),
    generatedAt: GENERATED_AT,
    roots: [{
      proposalId: "root",
      title: TASKMAP_WEDNESDAY_DEMO_COPY.rootTitle,
      summary: "Ship the Task Map with one honest input-to-artifact demo.",
      evidenceEventIds: ["task-created", "meeting-context-event"],
      memberObjectRefs: [
        "task:safe-ref",
        "context:odyssey-debate",
      ],
      confidence: 1,
    }],
    tasks: [{
      proposalId: "task",
      rootProposalId: "root",
      title: TASKMAP_WEDNESDAY_DEMO_COPY.leafTitle,
      summary: "Package the Odyssey attention-management demo without dispatch or source mutation.",
      evidenceEventIds: ["task-created", "meeting-context-event"],
      authoritativeTaskEventId: "task-created",
      openState: "open",
      confidence: 1,
    }],
    edges: [{
      proposalId: "edge",
      fromProposalId: "root",
      toProposalId: "task",
      relation: "advances",
      evidenceEventIds: ["meeting-context-event"],
      confidence: 1,
    }],
  };
}

function acceptedProjection(
  input: TaskMapInput,
  brain: SemanticBrainOutput,
): TaskMapProjectionV1 {
  const baseline = buildTaskMapProjection(input, brain, {
    arm: "E2",
    now: GENERATED_AT,
  });
  assert.equal(baseline.runStatus, "accepted", JSON.stringify(baseline.rejections));
  const projection = buildTaskMapProjection(input, brain, {
    arm: "E4",
    now: GENERATED_AT,
    previousProjection: baseline,
  });
  assert.equal(projection.runStatus, "accepted", JSON.stringify(projection.rejections));
  const root = projection.roots[0]!;
  const task = projection.tasks[0]!;
  return {
    ...projection,
    roots: projection.roots.map((row) => (
      row.id === root.id
        ? {
            ...row,
            id: TASKMAP_WEDNESDAY_DEMO_BINDING.rootId,
            taskIds: row.taskIds.map((taskId) => (
              taskId === task.id
                ? TASKMAP_WEDNESDAY_DEMO_BINDING.taskId
                : taskId
            )),
          }
        : row
    )),
    tasks: projection.tasks.map((row) => (
      row.id === task.id
        ? {
            ...row,
            id: TASKMAP_WEDNESDAY_DEMO_BINDING.taskId,
            rootId: TASKMAP_WEDNESDAY_DEMO_BINDING.rootId,
          }
        : row
    )),
    edges: projection.edges.map((edge) => ({
      ...edge,
      from: edge.from === root.id
        ? TASKMAP_WEDNESDAY_DEMO_BINDING.rootId
        : edge.from === task.id
          ? TASKMAP_WEDNESDAY_DEMO_BINDING.taskId
          : edge.from,
      to: edge.to === root.id
        ? TASKMAP_WEDNESDAY_DEMO_BINDING.rootId
        : edge.to === task.id
          ? TASKMAP_WEDNESDAY_DEMO_BINDING.taskId
          : edge.to,
    })),
  };
}

async function writePrivateJson(
  filePath: string,
  value: unknown,
  canonical = false,
): Promise<void> {
  const bytes = canonical
    ? taskMapContractCanonicalJson(value)
    : `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(filePath, bytes, { mode: 0o600 });
  await chmod(filePath, 0o600);
}

function currentWorkCore(projection: TaskMapProjectionV1): Record<string, unknown> {
  const projectionDigest = diffTaskMapProjections(null, projection).currentProjectionDigest;
  const root = projection.roots[0]!;
  const task = projection.tasks[0]!;
  const contextPointerIds = [...new Set([
    ...task.originPointerIds,
    ...task.citations
      .filter((citation) => citation.sourceKind !== "oura")
      .map((citation) => citation.pointerId),
  ])].sort();
  const returnTarget = task.returnRoute.state === "user_destination_required"
    ? { state: task.returnRoute.state }
    : {
        state: task.returnRoute.state,
        pointerId: task.returnRoute.pointerId,
      };
  return {
    contractVersion: "taskmap-current-work.v1",
    projection: {
      contractVersion: projection.contractVersion,
      runId: projection.runId,
      inputDigest: projection.inputDigest,
      generatedAt: projection.generatedAt,
      projectionDigest,
    },
    currentGoal: {
      rootId: root.id,
      title: root.title,
      accepted: true,
    },
    nextTaskToProve: {
      taskId: task.id,
      rootId: root.id,
      outcome: "An immutable approval-bound package is ready locally.",
      input: {
        summary: "Use only the exact accepted projection and current work.",
        contextPointerIds,
        agentSessionEpisode: {
          admission: "authenticated_fresh_agent_session",
          directive: "user_directive",
          userDirectiveSummary: "Prepare the customer launch checklist",
          episodeId: "tmaepisode_250aeaa278a0c4ff",
          episodeIdentityDigest:
            "8e5662d48cbe05f044bfb131d20576fbe2bb4123cc87def83a3f1dd556858770",
          episodeRevisionDigest:
            "16f62b4e49440b9421ab2668a7097469a71bf414eb39eaed39745ab6f3fb84e3",
          rootSessionIdentityDigest:
            "2cf7c9ea0e7c80d88db5de9e0817297160275a1d485b2b54345aeaa0ac4246f3",
          occurredAt: "2026-07-30T22:06:04.957Z",
          provider: "codex",
          routingIdentityKind: "repository",
          routingIdentityDigest:
            "b1c787fae927b1596fc69ff6fcbd1ab34e640aac7133a01f33fc273e1f22de2b",
          completionAuthority: false,
          reopenAuthority: false,
        },
      },
      predecessors: [],
      doneDefinition: [
        "Authorization is recorded separately from current-work.",
        "Package is ready locally with delivery not started.",
        "Source completion and outcome verification remain false.",
      ],
      permission: {
        requiresExplicitApproval: true,
        approvalGranted: false,
      },
      returnTarget,
      executable: false,
    },
    privacy: {
      sourceBodiesStored: false,
      localPathsStored: false,
      rawBiometricsStored: false,
    },
  };
}

const READY_APPROVAL_BOUNDARY = Object.freeze({
  contractVersion: "taskmap-local-approval-inspection.v1" as const,
  readyForLocalApproval: true as const,
  currentWorkApprovalGranted: false as const,
  currentWorkExecutable: false as const,
  authorizationScope: "prepare_local_package_only" as const,
  dispatchAuthorized: false as const,
  sourceWritebackAuthorized: false as const,
  codexTaskStartAuthorized: false as const,
  sourceCompletionAuthorized: false as const,
  outcomeVerificationAuthorized: false as const,
});

function readyProofTarget(
  target: TaskMapNativeCurrentWorkV1["nextTaskToProve"],
): TaskMapReadyFrontierProofTargetV1 {
  return {
    ...structuredClone(target),
    approvalPackage: { ...READY_APPROVAL_BOUNDARY },
  };
}

async function writeReadyProofTargets(
  taskMapRoot: string,
  projection: TaskMapProjectionV1,
  currentness: TaskMapNativeCurrentnessForWorkV1,
  proofTargets: TaskMapReadyFrontierProofTargetV1[],
): Promise<void> {
  await writePrivateJson(
    path.join(taskMapRoot, TASKMAP_READY_PROOF_TARGETS_FILENAME),
    buildTaskMapReadyProofTargets({
      projection,
      currentness,
      proofTargets,
    }),
    true,
  );
}

function bodySignalAssessment(
  projection: TaskMapProjectionV1,
  relationship: "body_informed" | "repeated_association" | "not_established" =
    "repeated_association",
): TaskMapBodySignalAssessmentV1 {
  const projectionDigest = diffTaskMapProjections(
    null,
    projection,
  ).currentProjectionDigest;
  const repeated = relationship === "repeated_association";
  const bodyInformed = relationship === "body_informed";
  const signalDates = ["2026-07-23", "2026-07-25", "2026-07-29"];
  const base = {
    contractVersion: TASKMAP_BODY_SIGNAL_ASSESSMENT_VERSION,
    projection: {
      runId: projection.runId,
      inputDigest: projection.inputDigest,
      projectionDigest,
    },
    physiologicalSnapshotDigest: "b".repeat(64),
    assessedAt: GENERATED_AT,
    sourceFamily: "physiological" as const,
    signal: {
      axis: "composite_recovery" as const,
      displayName: "Readiness + Sleep" as const,
      comparison: "relative_to_recent_personal_range" as const,
      targetCategory: "below_baseline" as const,
    },
    coverage: {
      startDay: "2026-07-01",
      endDay: "2026-07-29",
      classifiedDays: 29,
      unknownDays: 0,
    },
    roots: projection.roots
      .map((root) => ({
        rootId: root.id,
        relationship,
        ...(bodyInformed ? { evidenceLevel: "body_informed" as const } : {}),
        observedSignalDates: signalDates,
        matchedWorkDates: repeated
          ? signalDates
          : bodyInformed
            ? ["2026-07-25"]
            : [],
        matchedWorkSources: repeated
          ? [
              TASKMAP_BODY_SIGNAL_WORK_SOURCE_LABEL_BY_KIND.codex_session,
              TASKMAP_BODY_SIGNAL_WORK_SOURCE_LABEL_BY_KIND.gemini_meet,
            ]
          : bodyInformed
            ? [TASKMAP_BODY_SIGNAL_WORK_SOURCE_LABEL_BY_KIND.granola]
          : [],
        matchedDateCount: repeated ? signalDates.length : bodyInformed ? 1 : 0,
        signalSummary:
          "Readiness + Sleep was below your recent personal range on 2026-07-23, 2026-07-25, 2026-07-29 within 2026-07-01 through 2026-07-29.",
        relevanceSummary: repeated
          ? "Eligible work in this workstream repeated on 2026-07-23, 2026-07-25, 2026-07-29 across Codex sessions and Gemini meeting notes. This is an association, not proof of cause."
          : bodyInformed
            ? "Accepted work in this workstream occurred on 2026-07-25, when recovery was below your recent personal range in Granola meeting notes. This is an association, not proof of cause."
            : "Fewer than three overlap days had two independent work sources, so no repeated relationship is shown.",
        reasonCode: repeated || bodyInformed
          ? null
          : "insufficient_multi_source_backing" as const,
      }))
      .sort((left, right) => left.rootId.localeCompare(right.rootId)),
    boundary:
      "Body-informed context only. Association is not proof of cause." as const,
    privacy: {
      rawBiometricsStored: false as const,
      sourceBodiesStored: false as const,
      localPathsStored: false as const,
      providerIdentityStored: false as const,
    },
  };
  return {
    ...base,
    artifactDigest: taskMapContractDigest(base),
  };
}

async function createFixture(): Promise<Fixture> {
  const base = await realpath(
    await mkdtemp(path.join(tmpdir(), "taskmap-local-approval-")),
  );
  const ownerRoot = path.join(base, "owner");
  const taskMapRoot = path.join(ownerRoot, "taskmap");
  const executionRoot = path.join(ownerRoot, "taskmap-local-execution");
  await mkdir(taskMapRoot, { recursive: true, mode: 0o700 });
  await chmod(ownerRoot, 0o700);
  await chmod(taskMapRoot, 0o700);
  const input = inputFixture();
  const projection = acceptedProjection(input, brainFixture(input));
  const projectionDigest = diffTaskMapProjections(null, projection).currentProjectionDigest;
  const currentness = {
    contractVersion: "taskmap-native-currentness-gate.v1",
    runId: projection.runId,
    inputDigest: projection.inputDigest,
    projectionDigest,
    taskDispositions: projection.tasks.map((task) => ({
      taskId: task.id,
      disposition: "current",
    })),
  };
  const currentWorkWithoutDigest = currentWorkCore(projection);
  const currentWork = {
    ...currentWorkWithoutDigest,
    artifactDigest: taskMapContractDigest(currentWorkWithoutDigest),
  };
  const body = buildTaskMapBodyContextDisclosure(input, projection, {
    contractVersion: "oura-taskmap-context.v1",
    generatedAt: GENERATED_AT,
    sourceKind: "oura",
    coverage: {
      startDay: "2026-07-01",
      endDay: "2026-07-29",
      dailyActivityDays: 29,
      dailyReadinessDays: 29,
      dailySleepDays: 28,
      sleepRecords: 40,
      heartRateSamples: 12_000,
      classifiedDays: 1,
      unknownDays: 0,
    },
    classifier: {
      version: "relative-recovery.1",
      axis: "composite_recovery",
      method: "Personal baseline categories only.",
      minimumMetricsPerDay: 2,
      lowerThreshold: -1,
      upperThreshold: 1,
    },
    days: [{
      dayKey: "2026-07-29",
      axis: "composite_recovery",
      category: "below_baseline",
    }],
    privacy: {
      rawBiometricsStored: false,
      sourceBodiesStored: false,
      localPathsStored: false,
    },
  });
  const bodyAssessment = bodySignalAssessment(projection);
  await Promise.all([
    writePrivateJson(
      path.join(taskMapRoot, TASKMAP_FIXED_ARTIFACT_NAMES.projection),
      projection,
    ),
    writePrivateJson(
      path.join(taskMapRoot, TASKMAP_FIXED_ARTIFACT_NAMES.currentness),
      currentness,
    ),
    writePrivateJson(
      path.join(taskMapRoot, TASKMAP_FIXED_ARTIFACT_NAMES.currentWork),
      currentWork,
      true,
    ),
    writePrivateJson(
      path.join(taskMapRoot, TASKMAP_FIXED_ARTIFACT_NAMES.body),
      body,
    ),
    writePrivateJson(
      path.join(taskMapRoot, TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment),
      bodyAssessment,
      true,
    ),
  ]);
  return {
    base,
    ownerRoot,
    taskMapRoot,
    executionRoot,
    projection,
    targetTaskId: projection.tasks[0]!.id,
  };
}

async function createTwoTargetFixture(): Promise<Fixture & {
  secondTaskId: string;
}> {
  const fixture = await createFixture();
  const firstTask = fixture.projection.tasks[0]!;
  const root = fixture.projection.roots[0]!;
  const routeEdge = fixture.projection.edges.find((edge) => (
    (edge.from === root.id && edge.to === firstTask.id)
    || (edge.from === firstTask.id && edge.to === root.id)
  ));
  assert.ok(routeEdge, "fixture must expose a root-to-task route");
  const secondTaskId = "tmt_0000000000000002";
  const projection: TaskMapProjectionV1 = {
    ...structuredClone(fixture.projection),
    roots: fixture.projection.roots.map((candidate) => (
      candidate.id === root.id
        ? {
            ...structuredClone(candidate),
            taskIds: [...candidate.taskIds, secondTaskId],
          }
        : structuredClone(candidate)
    )),
    tasks: [
      ...fixture.projection.tasks.map((task) => structuredClone(task)),
      {
        ...structuredClone(firstTask),
        id: secondTaskId,
        title: "Prepare the second bounded owner package",
        summary: "Use the same accepted inputs for a distinct bounded leaf.",
      },
    ],
    edges: [
      ...fixture.projection.edges.map((edge) => structuredClone(edge)),
      {
        ...structuredClone(routeEdge),
        id: "tme_0000000000000002",
        from: routeEdge.from === firstTask.id ? secondTaskId : routeEdge.from,
        to: routeEdge.to === firstTask.id ? secondTaskId : routeEdge.to,
      },
    ],
  };
  const projectionDigest = diffTaskMapProjections(
    null,
    projection,
  ).currentProjectionDigest;
  const currentness: TaskMapNativeCurrentnessForWorkV1 = {
    contractVersion: "taskmap-native-currentness-gate.v1",
    runId: projection.runId,
    inputDigest: projection.inputDigest,
    projectionDigest,
    taskDispositions: projection.tasks.map((task) => ({
      taskId: task.id,
      disposition: "current",
    })),
  };
  const currentWorkWithoutDigest = currentWorkCore(projection);
  const currentWork = {
    ...currentWorkWithoutDigest,
    artifactDigest: taskMapContractDigest(currentWorkWithoutDigest),
  } as unknown as TaskMapNativeCurrentWorkV1;
  const firstTarget = currentWork.nextTaskToProve;
  const secondTarget: TaskMapNativeCurrentWorkV1["nextTaskToProve"] = {
    ...structuredClone(firstTarget),
    taskId: secondTaskId,
    outcome: "A second immutable approval-bound package is ready locally.",
  };
  await Promise.all([
    writePrivateJson(
      path.join(fixture.taskMapRoot, TASKMAP_FIXED_ARTIFACT_NAMES.projection),
      projection,
    ),
    writePrivateJson(
      path.join(fixture.taskMapRoot, TASKMAP_FIXED_ARTIFACT_NAMES.currentness),
      currentness,
    ),
    writePrivateJson(
      path.join(fixture.taskMapRoot, TASKMAP_FIXED_ARTIFACT_NAMES.currentWork),
      currentWork,
      true,
    ),
    writePrivateJson(
      path.join(fixture.taskMapRoot, TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment),
      bodySignalAssessment(projection),
      true,
    ),
    writeReadyProofTargets(
      fixture.taskMapRoot,
      projection,
      currentness,
      [readyProofTarget(firstTarget), readyProofTarget(secondTarget)],
    ),
  ]);
  fixture.projection = projection;
  return { ...fixture, secondTaskId };
}

async function createTerminalPredecessorFixture(): Promise<Fixture & {
  secondTaskId: string;
}> {
  const fixture = await createTwoTargetFixture();
  const firstTask = fixture.projection.tasks[0]!;
  const originalSecondTask = fixture.projection.tasks.find(
    (task) => task.id === fixture.secondTaskId,
  )!;
  const firstHomePointerId = firstTask.taskHomePointerId!;
  const firstHomeSource = fixture.projection.sources.find(
    (source) => source.id === firstHomePointerId,
  )!;
  const successorPointerId = "ptr-dependent-successor";
  const secondTask = {
    ...structuredClone(originalSecondTask),
    taskHomePointerId: successorPointerId,
    originPointerIds: [successorPointerId],
    returnRoute: {
      ...structuredClone(originalSecondTask.returnRoute),
      pointerId: successorPointerId,
    },
    citations: [{
      ...structuredClone(originalSecondTask.citations.find(
        (citation) => citation.pointerId === firstHomePointerId,
      )!),
      eventId: "task-created-successor",
      pointerId: successorPointerId,
    }],
  };
  const edgeTemplate = fixture.projection.edges[0]!;
  const projection: TaskMapProjectionV1 = {
    ...structuredClone(fixture.projection),
    sources: [
      ...fixture.projection.sources.map((source) => structuredClone(source)),
      {
        ...structuredClone(firstHomeSource),
        id: successorPointerId,
        sourceVersion: "taskmap-dependent-successor.1",
      },
    ],
    tasks: fixture.projection.tasks.map((task) => (
      task.id === secondTask.id
        ? structuredClone(secondTask)
        : structuredClone(task)
    )),
    edges: [
      ...fixture.projection.edges.map((edge) => structuredClone(edge)),
      {
        ...structuredClone(edgeTemplate),
        id: "tme_0000000000000003",
        from: secondTask.id,
        to: firstTask.id,
        relation: "depends_on",
      },
    ],
  };
  const projectionDigest = diffTaskMapProjections(
    null,
    projection,
  ).currentProjectionDigest;
  const currentness: TaskMapNativeCurrentnessForWorkV1 = {
    contractVersion: "taskmap-native-currentness-gate.v1",
    runId: projection.runId,
    inputDigest: projection.inputDigest,
    projectionDigest,
    taskDispositions: projection.tasks.map((task) => ({
      taskId: task.id,
      disposition: "current",
    })),
  };
  const currentWorkWithoutDigest = currentWorkCore(projection);
  const currentWork = {
    ...currentWorkWithoutDigest,
    artifactDigest: taskMapContractDigest(currentWorkWithoutDigest),
  } as unknown as TaskMapNativeCurrentWorkV1;
  const firstTarget = currentWork.nextTaskToProve;
  const secondTarget: TaskMapNativeCurrentWorkV1["nextTaskToProve"] = {
    ...structuredClone(firstTarget),
    taskId: secondTask.id,
    outcome: "The successor package is ready after its predecessor closes.",
    input: {
      ...structuredClone(firstTarget.input),
      contextPointerIds: [...new Set([
        ...secondTask.originPointerIds,
        ...secondTask.citations
          .filter((citation) => citation.sourceKind !== "oura")
          .map((citation) => citation.pointerId),
      ])].sort(),
    },
    returnTarget: secondTask.returnRoute.state === "user_destination_required"
      ? { state: secondTask.returnRoute.state }
      : {
          state: secondTask.returnRoute.state,
          pointerId: secondTask.returnRoute.pointerId,
        },
    predecessors: [{
      taskId: firstTask.id,
      relation: "depends_on",
      reviewState: firstTask.reviewState,
      openState: firstTask.openState,
    }],
  };
  await Promise.all([
    writePrivateJson(
      path.join(fixture.taskMapRoot, TASKMAP_FIXED_ARTIFACT_NAMES.projection),
      projection,
    ),
    writePrivateJson(
      path.join(fixture.taskMapRoot, TASKMAP_FIXED_ARTIFACT_NAMES.currentness),
      currentness,
    ),
    writePrivateJson(
      path.join(fixture.taskMapRoot, TASKMAP_FIXED_ARTIFACT_NAMES.currentWork),
      currentWork,
      true,
    ),
    writePrivateJson(
      path.join(
        fixture.taskMapRoot,
        TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment,
      ),
      bodySignalAssessment(projection),
      true,
    ),
    writeReadyProofTargets(
      fixture.taskMapRoot,
      projection,
      currentness,
      [readyProofTarget(firstTarget), readyProofTarget(secondTarget)],
    ),
  ]);
  fixture.projection = projection;
  return fixture;
}

async function mutateCurrentWork(
  fixture: Fixture,
  mutate: (value: Record<string, unknown>) => void,
): Promise<void> {
  const filePath = path.join(
    fixture.taskMapRoot,
    TASKMAP_FIXED_ARTIFACT_NAMES.currentWork,
  );
  const value = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
  delete value.artifactDigest;
  mutate(value);
  const resealed = {
    ...value,
    artifactDigest: taskMapContractDigest(value),
  };
  await writePrivateJson(filePath, resealed, true);
}

async function mutateBodyAssessment(
  fixture: Fixture,
  mutate: (value: Record<string, unknown>) => void,
  reseal = true,
): Promise<void> {
  const filePath = path.join(
    fixture.taskMapRoot,
    TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment,
  );
  const value = JSON.parse(
    await readFile(filePath, "utf8"),
  ) as Record<string, unknown>;
  delete value.artifactDigest;
  mutate(value);
  const next = reseal
    ? {
        ...value,
        artifactDigest: taskMapContractDigest(value),
      }
    : {
        ...value,
        artifactDigest: "0".repeat(64),
      };
  await writePrivateJson(filePath, next, true);
}

async function quartetDigests(fixture: Fixture): Promise<Record<string, string>> {
  return Object.fromEntries(await Promise.all(
    Object.values(TASKMAP_FIXED_ARTIFACT_NAMES).map(async (name) => [
      name,
      sha256(await readFile(path.join(fixture.taskMapRoot, name))),
    ]),
  ));
}

async function inspectAndPrepare(fixture: Fixture) {
  const { inspection } = await inspectTaskMapLocalApproval({
    taskMapRoot: fixture.taskMapRoot,
    ownerRoot: fixture.ownerRoot,
  });
  const prepared = await approveAndPrepareTaskMapLocalPackage({
    taskMapRoot: fixture.taskMapRoot,
    ownerRoot: fixture.ownerRoot,
    executionRoot: fixture.executionRoot,
    expectedOwnerScopeDigest: inspection.localOwnerScopeDigest,
    expectedProofDigest: inspection.proofDigest,
    taskId: inspection.task.taskId,
    idempotencyKey: inspection.prepareIdempotencyKey,
    authorizedAt: AUTHORIZED_AT,
  });
  return { inspection, prepared };
}

function resealArtifact(
  value: Record<string, unknown>,
  digestKey: string,
  idKey: string,
  idPrefix: string,
  domain: string,
): Record<string, unknown> {
  const core = { ...value };
  delete core[digestKey];
  delete core[idKey];
  const digest = taskMapContractDigest({ domain, ...core });
  return {
    ...core,
    [idKey]: `${idPrefix}${digest}`,
    [digestKey]: digest,
  };
}

describe("Task Map local approval package", () => {
  it("inspects an exact current quartet without granting execution", async () => {
    const fixture = await createFixture();
    try {
      const quartetBefore = await quartetDigests(fixture);
      const { inspection, response } = await inspectTaskMapLocalApproval({
        taskMapRoot: fixture.taskMapRoot,
        ownerRoot: fixture.ownerRoot,
      });
      assert.equal(inspection.readyForLocalApproval, true);
      assert.equal(inspection.currentWorkApprovalGranted, false);
      assert.equal(inspection.currentWorkExecutable, false);
      assert.equal(inspection.dispatchAuthorized, false);
      assert.equal(inspection.codexTaskStartAuthorized, false);
      assert.deepEqual(inspection.task.routeNodeIds, [
        fixture.projection.roots[0]!.id,
        fixture.targetTaskId,
      ]);
      assert.equal(response.status, "ready_for_approval");
      assert.equal(response.approvalRecorded, false);
      assert.equal(response.packageId, null);
      assert.equal(response.deliveryStatus, "not_started");
      assert.equal(response.sourceCompletion, false);
      assert.equal(response.outcomeVerified, false);
      assert.equal(
        response.bodyAssessmentFileDigest,
        quartetBefore[TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment],
      );
      assert.equal(
        response.bodyAssessmentArtifactDigest,
        inspection.task.bodySignal.assessmentArtifactDigest,
      );
      assert.equal(
        response.physiologicalSnapshotDigest,
        inspection.task.bodySignal.physiologicalSnapshotDigest,
      );
      assert.deepEqual(await quartetDigests(fixture), quartetBefore);
      await assert.rejects(
        lstat(fixture.executionRoot),
        (error: NodeJS.ErrnoException) => error.code === "ENOENT",
      );
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("keeps an existing empty execution root read-only and ready for approval", async () => {
    const fixture = await createFixture();
    try {
      await mkdir(fixture.executionRoot, { mode: 0o700 });
      const quartetBefore = await quartetDigests(fixture);
      const response = await inspectTaskMapLocalApproval({
        taskMapRoot: fixture.taskMapRoot,
        ownerRoot: fixture.ownerRoot,
      });
      assert.equal(response.response.status, "ready_for_approval");
      assert.deepEqual(await readdir(fixture.executionRoot), []);
      assert.deepEqual(await quartetDigests(fixture), quartetBefore);
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("records a separate approval and prepares three immutable owner-only artifacts", async () => {
    const fixture = await createFixture();
    try {
      const before = await quartetDigests(fixture);
      const { inspection } = await inspectTaskMapLocalApproval({
        taskMapRoot: fixture.taskMapRoot,
        ownerRoot: fixture.ownerRoot,
      });
      const result = await approveAndPrepareTaskMapLocalPackage({
        taskMapRoot: fixture.taskMapRoot,
        ownerRoot: fixture.ownerRoot,
        executionRoot: fixture.executionRoot,
        expectedOwnerScopeDigest: inspection.localOwnerScopeDigest,
        expectedProofDigest: inspection.proofDigest,
        taskId: inspection.task.taskId,
        idempotencyKey: inspection.prepareIdempotencyKey,
        authorizedAt: AUTHORIZED_AT,
      });
      assert.equal(result.replayed, false);
      assert.equal(result.response.status, "package_ready");
      assert.equal(result.response.approvalRecorded, true);
      assert.match(result.authorization.approvalAuthorizationId, /^tmauthorization_[a-f0-9]{64}$/);
      assert.match(result.package.packageId, /^tmlocalpackage_[a-f0-9]{64}$/);
      assert.match(result.receipt.preparationReceiptId, /^tmpreparationreceipt_[a-f0-9]{64}$/);
      assert.deepEqual(result.package.executionBoundary, {
        state: "prepared_not_started",
        approvalRecorded: true,
        deliveryStatus: "not_started",
        taskStarted: false,
        taskExecuted: false,
        dispatchAuthorized: false,
        sourceWritebackAuthorized: false,
        codexTaskStartAuthorized: false,
      });
      assert.equal(result.receipt.deliveryStatus, "not_started");
      assert.equal(result.receipt.noDispatch, true);
      assert.equal(result.receipt.sourceMutationAttempted, false);
      assert.equal(result.receipt.sourceCompletion, false);
      assert.equal(result.receipt.outcomeVerified, false);
      assert.equal(
        Object.hasOwn(result.package.task, "demoLeaf"),
        false,
      );
      assert.equal(
        result.package.task.outcome,
        "An immutable approval-bound package is ready locally.",
      );
      assert.equal(
        result.package.task.input.summary,
        "Use only the exact accepted projection and current work.",
      );
      assert.ok(result.response.artifactAccess);
      assert.equal(
        result.response.artifactAccess.revealDirectoryPath,
        fixture.executionRoot,
      );
      assert.deepEqual(await quartetDigests(fixture), before);
      const executionStats = await lstat(fixture.executionRoot);
      assert.equal(executionStats.mode & 0o777, 0o700);
      const expectedFiles = [
        `authorization_${inspection.prepareIdempotencyKey}.json`,
        `package_${result.authorization.approvalAuthorizationId}.json`,
        `receipt_${result.package.packageId}.json`,
      ];
      assert.deepEqual(
        (await readdir(fixture.executionRoot)).sort(),
        [...expectedFiles].sort(),
      );
      for (const name of expectedFiles) {
        const stats = await lstat(path.join(fixture.executionRoot, name));
        assert.equal(stats.mode & 0o777, 0o600);
        assert.equal(stats.nlink, 1);
      }
      const preparedBytes = Object.fromEntries(await Promise.all(
        expectedFiles.map(async (name) => [
          name,
          sha256(await readFile(path.join(fixture.executionRoot, name))),
        ]),
      ));
      const restarted = await inspectTaskMapLocalApproval({
        taskMapRoot: fixture.taskMapRoot,
        ownerRoot: fixture.ownerRoot,
      });
      assert.deepEqual(restarted.inspection, inspection);
      assert.deepEqual(restarted.response, result.response);
      assert.deepEqual((await readdir(fixture.executionRoot)).sort(), expectedFiles.sort());
      assert.deepEqual(
        Object.fromEntries(await Promise.all(
          expectedFiles.map(async (name) => [
            name,
            sha256(await readFile(path.join(fixture.executionRoot, name))),
          ]),
        )),
        preparedBytes,
      );
      assert.deepEqual(await quartetDigests(fixture), before);
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("gives a fresh Codex or Claude session a complete brief from package bytes alone", async () => {
    const fixture = await createFixture();
    try {
      const { prepared } = await inspectAndPrepare(fixture);
      const access = prepared.response.artifactAccess;
      assert.ok(access);

      // Deliberately read only the exported package and receipt. A fresh agent
      // should not need the source projection, this test fixture, or chat state.
      const packageOnly = JSON.parse(
        await readFile(access.packagePath, "utf8"),
      ) as TaskMapLocalExecutionPackageV1;
      const receiptOnly = JSON.parse(
        await readFile(access.receiptPath, "utf8"),
      ) as TaskMapLocalPreparationReceiptV1;
      assert.equal(Object.hasOwn(packageOnly, "adapter"), false);
      assert.equal(Object.hasOwn(packageOnly, "runtimeRequest"), false);
      assert.equal(Object.hasOwn(receiptOnly, "adapter"), false);
      assert.equal(Object.hasOwn(receiptOnly, "runtimeRequest"), false);
      assert.equal(Object.hasOwn(packageOnly.task, "demoLeaf"), false);
      assert.equal(packageOnly.task.taskId, fixture.targetTaskId);
      assert.equal(
        packageOnly.task.outcome,
        "An immutable approval-bound package is ready locally.",
      );
      assert.equal(
        packageOnly.task.input.summary,
        "Use only the exact accepted projection and current work.",
      );
      assert.deepEqual(packageOnly.task.doneDefinition, [
        "Authorization is recorded separately from current-work.",
        "Package is ready locally with delivery not started.",
        "Source completion and outcome verification remain false.",
      ]);
      assert.deepEqual(packageOnly.task.returnTarget, {
        state: "source_owned",
        pointerId: TASKMAP_WEDNESDAY_DEMO_BINDING.taskHomePointerId,
      });
      assert.equal(
        packageOnly.task.bodySignal.relationship,
        "repeated_association",
      );
      assert.deepEqual(
        packageOnly.task.bodySignal.matchedWorkDates,
        ["2026-07-23", "2026-07-25", "2026-07-29"],
      );
      assert.deepEqual(
        packageOnly.task.bodySignal.matchedWorkSources,
        [
          TASKMAP_BODY_SIGNAL_WORK_SOURCE_LABEL_BY_KIND.codex_session,
          TASKMAP_BODY_SIGNAL_WORK_SOURCE_LABEL_BY_KIND.gemini_meet,
        ],
      );
      assert.equal(
        packageOnly.task.bodySignal.assessmentArtifactDigest,
        packageOnly.quartet.bodyAssessmentArtifactDigest,
      );
      assert.equal(
        packageOnly.task.bodySignal.physiologicalSnapshotDigest,
        packageOnly.quartet.physiologicalSnapshotDigest,
      );
      assert.equal(
        packageOnly.quartet.bodyAssessmentFileDigest,
        sha256(await readFile(
          path.join(
            fixture.taskMapRoot,
            TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment,
          ),
        )),
      );
      assert.doesNotMatch(
        [
          ...packageOnly.task.doneDefinition,
          packageOnly.task.bodySignal.signalSummary,
          packageOnly.task.bodySignal.relevanceSummary,
          packageOnly.task.bodySignal.boundary,
        ].join(" "),
        /\b(?:C0|C2|causal|qualified signal|Oura)\b/i,
      );
      assert.equal(packageOnly.task.sourceEvidence.length, 2);
      assert.equal(packageOnly.executionBoundary.approvalRecorded, true);
      assert.equal(packageOnly.executionBoundary.dispatchAuthorized, false);
      assert.equal(packageOnly.executionBoundary.sourceWritebackAuthorized, false);
      assert.equal(packageOnly.executionBoundary.taskStarted, false);
      assert.equal(packageOnly.executionBoundary.taskExecuted, false);
      assert.equal(receiptOnly.packageId, packageOnly.packageId);
      assert.equal(receiptOnly.noDispatch, true);
      assert.equal(receiptOnly.sourceMutationAttempted, false);
      assert.equal(receiptOnly.sourceCompletion, false);
      assert.equal(receiptOnly.outcomeVerified, false);
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("fails closed when the body-signal assessment is missing, tampered, or bound to another projection", async () => {
    const missing = await createFixture();
    try {
      await rm(path.join(
        missing.taskMapRoot,
        TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment,
      ));
      await assert.rejects(
        inspectTaskMapLocalApproval({
          taskMapRoot: missing.taskMapRoot,
          ownerRoot: missing.ownerRoot,
        }),
        /body-signal assessment is missing/,
      );
    } finally {
      await rm(missing.base, { recursive: true, force: true });
    }

    const tampered = await createFixture();
    try {
      await mutateBodyAssessment(tampered, () => {}, false);
      await assert.rejects(
        inspectTaskMapLocalApproval({
          taskMapRoot: tampered.taskMapRoot,
          ownerRoot: tampered.ownerRoot,
        }),
        /body-signal assessment artifact digest is invalid/,
      );
    } finally {
      await rm(tampered.base, { recursive: true, force: true });
    }

    const wrongProjection = await createFixture();
    try {
      await mutateBodyAssessment(wrongProjection, (value) => {
        const projection = value.projection as Record<string, unknown>;
        projection.projectionDigest = "f".repeat(64);
      });
      await assert.rejects(
        inspectTaskMapLocalApproval({
          taskMapRoot: wrongProjection.taskMapRoot,
          ownerRoot: wrongProjection.ownerRoot,
        }),
        /body-signal assessment is not bound to every projected root/,
      );
    } finally {
      await rm(wrongProjection.base, { recursive: true, force: true });
    }
  });

  it("exports an honest no-pattern body sentence without changing approval or dispatch", async () => {
    const fixture = await createFixture();
    try {
      await writePrivateJson(
        path.join(
          fixture.taskMapRoot,
          TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment,
        ),
        bodySignalAssessment(fixture.projection, "not_established"),
        true,
      );
      const { inspection, prepared } = await inspectAndPrepare(fixture);
      assert.equal(
        inspection.task.bodySignal.relationship,
        "not_established",
      );
      assert.deepEqual(inspection.task.bodySignal.matchedWorkDates, []);
      assert.deepEqual(inspection.task.bodySignal.matchedWorkSources, []);
      assert.match(
        inspection.task.bodySignal.signalSummary,
        /Readiness \+ Sleep was below your recent personal range on 2026-07-23, 2026-07-25, 2026-07-29/,
      );
      assert.match(
        inspection.task.bodySignal.relevanceSummary,
        /no repeated relationship is shown/,
      );
      assert.doesNotMatch(
        taskMapContractCanonicalJson(inspection.task.bodySignal),
        /\b(?:C0|C2|causal|Oura)\b/i,
      );
      assert.equal(prepared.package.executionBoundary.dispatchAuthorized, false);
      assert.equal(prepared.package.executionBoundary.taskStarted, false);
      assert.equal(prepared.receipt.noDispatch, true);
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("preserves a qualified body-informed association without granting dispatch authority", async () => {
    const fixture = await createFixture();
    try {
      await writePrivateJson(
        path.join(
          fixture.taskMapRoot,
          TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment,
        ),
        bodySignalAssessment(fixture.projection, "body_informed"),
        true,
      );
      const { inspection, prepared } = await inspectAndPrepare(fixture);
      assert.equal(
        inspection.task.bodySignal.relationship,
        "body_informed",
      );
      assert.deepEqual(
        inspection.task.bodySignal.matchedWorkDates,
        ["2026-07-25"],
      );
      assert.deepEqual(
        inspection.task.bodySignal.matchedWorkSources,
        [TASKMAP_BODY_SIGNAL_WORK_SOURCE_LABEL_BY_KIND.granola],
      );
      assert.match(
        inspection.task.bodySignal.boundary,
        /association is not proof of cause/i,
      );
      assert.equal(prepared.package.executionBoundary.dispatchAuthorized, false);
      assert.equal(prepared.package.executionBoundary.taskStarted, false);
      assert.equal(prepared.receipt.noDispatch, true);
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("accepts the current no-exact-root-work-overlap result for unrelated roots", async () => {
    const fixture = await createFixture();
    try {
      await writePrivateJson(
        path.join(
          fixture.taskMapRoot,
          TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment,
        ),
        bodySignalAssessment(fixture.projection, "not_established"),
        true,
      );
      await mutateBodyAssessment(fixture, (value) => {
        const roots = value.roots as Array<Record<string, unknown>>;
        for (const root of roots) {
          root.reasonCode = "no_exact_root_work_overlap";
        }
      });
      const { inspection } = await inspectAndPrepare(fixture);
      assert.equal(
        inspection.task.bodySignal.relationship,
        "not_established",
      );
      assert.deepEqual(inspection.task.bodySignal.matchedWorkDates, []);
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("rejects body-signal dates outside the authenticated coverage interval", async () => {
    const fixture = await createFixture();
    try {
      await mutateBodyAssessment(fixture, (value) => {
        const roots = value.roots as Array<Record<string, unknown>>;
        roots[0]!.observedSignalDates = [
          "2026-06-30",
          "2026-07-23",
          "2026-07-25",
        ];
        roots[0]!.matchedWorkDates = [
          "2026-06-30",
          "2026-07-23",
          "2026-07-25",
        ];
      });
      await assert.rejects(
        inspectTaskMapLocalApproval({
          taskMapRoot: fixture.taskMapRoot,
          ownerRoot: fixture.ownerRoot,
        }),
        /must be unique, sorted, and within coverage/,
      );
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("replays the exact first authorization when the timestamp changes", async () => {
    const fixture = await createFixture();
    try {
      const { inspection } = await inspectTaskMapLocalApproval({
        taskMapRoot: fixture.taskMapRoot,
        ownerRoot: fixture.ownerRoot,
      });
      const common = {
        taskMapRoot: fixture.taskMapRoot,
        ownerRoot: fixture.ownerRoot,
        executionRoot: fixture.executionRoot,
        expectedOwnerScopeDigest: inspection.localOwnerScopeDigest,
        expectedProofDigest: inspection.proofDigest,
        taskId: inspection.task.taskId,
        idempotencyKey: inspection.prepareIdempotencyKey,
      };
      const first = await approveAndPrepareTaskMapLocalPackage({
        ...common,
        authorizedAt: AUTHORIZED_AT,
      });
      const replay = await approveAndPrepareTaskMapLocalPackage({
        ...common,
        authorizedAt: "2026-07-29T12:06:00.000Z",
      });
      assert.equal(replay.replayed, true);
      assert.deepEqual(replay.authorization, first.authorization);
      assert.deepEqual(replay.package, first.package);
      assert.deepEqual(replay.receipt, first.receipt);
      assert.deepEqual(replay.response, first.response);
      const restarted = await inspectTaskMapLocalApproval({
        taskMapRoot: fixture.taskMapRoot,
        ownerRoot: fixture.ownerRoot,
      });
      assert.deepEqual(restarted.response, first.response);
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("serializes concurrent duplicates and repairs an authorization-only residue", async () => {
    const fixture = await createFixture();
    try {
      const { inspection } = await inspectTaskMapLocalApproval({
        taskMapRoot: fixture.taskMapRoot,
        ownerRoot: fixture.ownerRoot,
      });
      const common = {
        taskMapRoot: fixture.taskMapRoot,
        ownerRoot: fixture.ownerRoot,
        executionRoot: fixture.executionRoot,
        expectedOwnerScopeDigest: inspection.localOwnerScopeDigest,
        expectedProofDigest: inspection.proofDigest,
        taskId: inspection.task.taskId,
        idempotencyKey: inspection.prepareIdempotencyKey,
      };
      const [first, second] = await Promise.all([
        approveAndPrepareTaskMapLocalPackage({
          ...common,
          authorizedAt: AUTHORIZED_AT,
        }),
        approveAndPrepareTaskMapLocalPackage({
          ...common,
          authorizedAt: "2026-07-29T12:06:00.000Z",
        }),
      ]);
      assert.deepEqual(first.authorization, second.authorization);
      assert.deepEqual(first.package, second.package);
      assert.deepEqual(first.receipt, second.receipt);
      assert.deepEqual(
        (await readdir(fixture.executionRoot)).sort(),
        [
          `authorization_${inspection.prepareIdempotencyKey}.json`,
          `package_${first.authorization.approvalAuthorizationId}.json`,
          `receipt_${first.package.packageId}.json`,
        ].sort(),
      );
      await rm(
        path.join(
          fixture.executionRoot,
          `package_${first.authorization.approvalAuthorizationId}.json`,
        ),
      );
      await rm(
        path.join(
          fixture.executionRoot,
          `receipt_${first.package.packageId}.json`,
        ),
      );
      await assert.rejects(
        inspectTaskMapLocalApproval({
          taskMapRoot: fixture.taskMapRoot,
          ownerRoot: fixture.ownerRoot,
        }),
        /local execution package is missing/,
      );
      const recovered = await approveAndPrepareTaskMapLocalPackage({
        ...common,
        authorizedAt: "2026-07-29T12:07:00.000Z",
      });
      assert.equal(recovered.replayed, true);
      assert.deepEqual(recovered.authorization, first.authorization);
      assert.deepEqual(recovered.package, first.package);
      assert.deepEqual(recovered.receipt, first.receipt);
      const restarted = await inspectTaskMapLocalApproval({
        taskMapRoot: fixture.taskMapRoot,
        ownerRoot: fixture.ownerRoot,
      });
      assert.deepEqual(restarted.response, recovered.response);
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("fails closed on an authorization-and-package partial chain and lets approve-prepare repair it", async () => {
    const fixture = await createFixture();
    try {
      const { inspection, prepared } = await inspectAndPrepare(fixture);
      await rm(
        path.join(
          fixture.executionRoot,
          `receipt_${prepared.package.packageId}.json`,
        ),
      );
      await assert.rejects(
        inspectTaskMapLocalApproval({
          taskMapRoot: fixture.taskMapRoot,
          ownerRoot: fixture.ownerRoot,
        }),
        /preparation receipt is missing/,
      );
      const repaired = await approveAndPrepareTaskMapLocalPackage({
        taskMapRoot: fixture.taskMapRoot,
        ownerRoot: fixture.ownerRoot,
        executionRoot: fixture.executionRoot,
        expectedOwnerScopeDigest: inspection.localOwnerScopeDigest,
        expectedProofDigest: inspection.proofDigest,
        taskId: inspection.task.taskId,
        idempotencyKey: inspection.prepareIdempotencyKey,
        authorizedAt: "2026-07-29T12:07:00.000Z",
      });
      assert.equal(repaired.replayed, true);
      assert.deepEqual(repaired.authorization, prepared.authorization);
      assert.deepEqual(repaired.package, prepared.package);
      assert.deepEqual(repaired.receipt, prepared.receipt);
      assert.deepEqual(
        (await inspectTaskMapLocalApproval({
          taskMapRoot: fixture.taskMapRoot,
          ownerRoot: fixture.ownerRoot,
        })).response,
        repaired.response,
      );
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("ignores a valid stale chain for another proof when current authorization is absent", async () => {
    const fixture = await createFixture();
    try {
      const { inspection: oldInspection } = await inspectAndPrepare(fixture);
      const staleFiles = (await readdir(fixture.executionRoot)).sort();
      const staleDigests = Object.fromEntries(await Promise.all(
        staleFiles.map(async (name) => [
          name,
          sha256(await readFile(path.join(fixture.executionRoot, name))),
        ]),
      ));
      await mutateCurrentWork(fixture, (value) => {
        const next = value.nextTaskToProve as Record<string, unknown>;
        next.doneDefinition = [
          "Authorization remains separate from current work.",
          "The successor package remains local and is not dispatched.",
        ];
      });
      const quartetBefore = await quartetDigests(fixture);
      const current = await inspectTaskMapLocalApproval({
        taskMapRoot: fixture.taskMapRoot,
        ownerRoot: fixture.ownerRoot,
      });
      assert.notEqual(
        current.inspection.prepareIdempotencyKey,
        oldInspection.prepareIdempotencyKey,
      );
      assert.equal(current.response.status, "ready_for_approval");
      assert.equal(current.response.approvalRecorded, false);
      assert.deepEqual((await readdir(fixture.executionRoot)).sort(), staleFiles);
      assert.deepEqual(
        Object.fromEntries(await Promise.all(
          staleFiles.map(async (name) => [
            name,
            sha256(await readFile(path.join(fixture.executionRoot, name))),
          ]),
        )),
        staleDigests,
      );
      assert.deepEqual(await quartetDigests(fixture), quartetBefore);
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("rejects a canonically resealed conflicting package and receipt", async () => {
    const packageFixture = await createFixture();
    try {
      const { prepared } = await inspectAndPrepare(packageFixture);
      const packagePath = path.join(
        packageFixture.executionRoot,
        `package_${prepared.authorization.approvalAuthorizationId}.json`,
      );
      const changedPackage = JSON.parse(
        await readFile(packagePath, "utf8"),
      ) as Record<string, unknown>;
      const boundary = changedPackage.executionBoundary as Record<string, unknown>;
      boundary.approvalRecorded = false;
      await writePrivateJson(
        packagePath,
        resealArtifact(
          changedPackage,
          "packageDigest",
          "packageId",
          "tmlocalpackage_",
          "taskmap-local-execution-package.1",
        ),
        true,
      );
      await assert.rejects(
        inspectTaskMapLocalApproval({
          taskMapRoot: packageFixture.taskMapRoot,
          ownerRoot: packageFixture.ownerRoot,
        }),
        /local execution package conflicts with the authorization/,
      );
    } finally {
      await rm(packageFixture.base, { recursive: true, force: true });
    }

    const receiptFixture = await createFixture();
    try {
      const { prepared } = await inspectAndPrepare(receiptFixture);
      const receiptPath = path.join(
        receiptFixture.executionRoot,
        `receipt_${prepared.package.packageId}.json`,
      );
      const changedReceipt = JSON.parse(
        await readFile(receiptPath, "utf8"),
      ) as Record<string, unknown>;
      changedReceipt.sourceCompletion = true;
      await writePrivateJson(
        receiptPath,
        resealArtifact(
          changedReceipt,
          "preparationReceiptDigest",
          "preparationReceiptId",
          "tmpreparationreceipt_",
          "taskmap-local-preparation-receipt.1",
        ),
        true,
      );
      await assert.rejects(
        inspectTaskMapLocalApproval({
          taskMapRoot: receiptFixture.taskMapRoot,
          ownerRoot: receiptFixture.ownerRoot,
        }),
        /preparation receipt conflicts with the package/,
      );
    } finally {
      await rm(receiptFixture.base, { recursive: true, force: true });
    }
  });

  it("rejects stale proof drift and a conflicting idempotency key", async () => {
    const fixture = await createFixture();
    try {
      const { inspection } = await inspectTaskMapLocalApproval({
        taskMapRoot: fixture.taskMapRoot,
        ownerRoot: fixture.ownerRoot,
      });
      await mutateCurrentWork(fixture, (value) => {
        const next = value.nextTaskToProve as Record<string, unknown>;
        next.doneDefinition = ["A changed completion boundary."];
      });
      await assert.rejects(
        approveAndPrepareTaskMapLocalPackage({
          taskMapRoot: fixture.taskMapRoot,
          ownerRoot: fixture.ownerRoot,
          executionRoot: fixture.executionRoot,
          expectedOwnerScopeDigest: inspection.localOwnerScopeDigest,
          expectedProofDigest: inspection.proofDigest,
          taskId: inspection.task.taskId,
          idempotencyKey: inspection.prepareIdempotencyKey,
          authorizedAt: AUTHORIZED_AT,
        }),
        /does not match the current proof/,
      );
      const current = await inspectTaskMapLocalApproval({
        taskMapRoot: fixture.taskMapRoot,
        ownerRoot: fixture.ownerRoot,
      });
      await assert.rejects(
        approveAndPrepareTaskMapLocalPackage({
          taskMapRoot: fixture.taskMapRoot,
          ownerRoot: fixture.ownerRoot,
          executionRoot: fixture.executionRoot,
          expectedOwnerScopeDigest: current.inspection.localOwnerScopeDigest,
          expectedProofDigest: current.inspection.proofDigest,
          taskId: current.inspection.task.taskId,
          idempotencyKey: "f".repeat(64),
          authorizedAt: AUTHORIZED_AT,
        }),
        /does not match the current proof/,
      );
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("rejects an unauthorized execution root before any filesystem mutation", async () => {
    const fixture = await createFixture();
    try {
      const { inspection } = await inspectTaskMapLocalApproval({
        taskMapRoot: fixture.taskMapRoot,
        ownerRoot: fixture.ownerRoot,
      });
      const common = {
        taskMapRoot: fixture.taskMapRoot,
        ownerRoot: fixture.ownerRoot,
        expectedOwnerScopeDigest: inspection.localOwnerScopeDigest,
        expectedProofDigest: inspection.proofDigest,
        taskId: inspection.task.taskId,
        idempotencyKey: inspection.prepareIdempotencyKey,
        authorizedAt: AUTHORIZED_AT,
      };
      const outside = path.join(fixture.base, "outside-execution");
      await assert.rejects(
        approveAndPrepareTaskMapLocalPackage({
          ...common,
          executionRoot: outside,
        }),
        /fixed distinct product paths/,
      );
      await assert.rejects(
        lstat(outside),
        (error: NodeJS.ErrnoException) => error.code === "ENOENT",
      );
      const before = (await readdir(fixture.taskMapRoot)).sort();
      await assert.rejects(
        approveAndPrepareTaskMapLocalPackage({
          ...common,
          executionRoot: fixture.taskMapRoot,
        }),
        /fixed distinct product paths/,
      );
      assert.deepEqual((await readdir(fixture.taskMapRoot)).sort(), before);
      assert.equal(
        before.some((name) => (
          name.startsWith("authorization_")
          || name.startsWith("package_")
          || name.startsWith("receipt_")
        )),
        false,
      );
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("rejects private paths or raw biometric/source text before preparing a privacy-false package", async () => {
    const mutations: Array<(value: Record<string, unknown>) => void> = [
      (value) => {
        const next = value.nextTaskToProve as Record<string, unknown>;
        const input = next.input as Record<string, unknown>;
        input.summary = "Read /Users/private-owner/secret.txt before preparing.";
      },
      (value) => {
        const next = value.nextTaskToProve as Record<string, unknown>;
        next.outcome = "Raw HRV measured 23 ms before this task.";
      },
      (value) => {
        const next = value.nextTaskToProve as Record<string, unknown>;
        next.doneDefinition = ["Use Bearer topsecretvalue to reach the source."];
      },
    ];
    for (const mutate of mutations) {
      const fixture = await createFixture();
      try {
        await mutateCurrentWork(fixture, mutate);
        await assert.rejects(
          inspectTaskMapLocalApproval({
            taskMapRoot: fixture.taskMapRoot,
            ownerRoot: fixture.ownerRoot,
          }),
          /package content violates the privacy boundary/,
        );
        await assert.rejects(
          lstat(fixture.executionRoot),
          (error: NodeJS.ErrnoException) => error.code === "ENOENT",
        );
      } finally {
        await rm(fixture.base, { recursive: true, force: true });
      }
    }
  });

  it("rejects executable/current-work approval, cross-owner replay, and unsafe files", async () => {
    const executableFixture = await createFixture();
    try {
      await mutateCurrentWork(executableFixture, (value) => {
        const next = value.nextTaskToProve as Record<string, unknown>;
        next.executable = true;
      });
      await assert.rejects(
        inspectTaskMapLocalApproval({
          taskMapRoot: executableFixture.taskMapRoot,
          ownerRoot: executableFixture.ownerRoot,
        }),
        /pre-approval and non-executable/,
      );
    } finally {
      await rm(executableFixture.base, { recursive: true, force: true });
    }

    const fixture = await createFixture();
    try {
      const { inspection } = await inspectTaskMapLocalApproval({
        taskMapRoot: fixture.taskMapRoot,
        ownerRoot: fixture.ownerRoot,
      });
      const copiedBase = await realpath(
        await mkdtemp(path.join(tmpdir(), "taskmap-local-owner-copy-")),
      );
      const copiedOwner = path.join(copiedBase, "owner");
      const copiedTaskMap = path.join(copiedOwner, "taskmap");
      await mkdir(copiedTaskMap, { recursive: true, mode: 0o700 });
      await chmod(copiedOwner, 0o700);
      for (const name of Object.values(TASKMAP_FIXED_ARTIFACT_NAMES)) {
        await writeFile(
          path.join(copiedTaskMap, name),
          await readFile(path.join(fixture.taskMapRoot, name)),
          { mode: 0o600 },
        );
      }
      const copiedScope = await deriveTaskMapLocalOwnerScopeDigest(copiedOwner);
      assert.notEqual(copiedScope, inspection.localOwnerScopeDigest);
      await assert.rejects(
        approveAndPrepareTaskMapLocalPackage({
          taskMapRoot: copiedTaskMap,
          ownerRoot: copiedOwner,
          executionRoot: path.join(copiedOwner, "taskmap-local-execution"),
          expectedOwnerScopeDigest: inspection.localOwnerScopeDigest,
          expectedProofDigest: inspection.proofDigest,
          taskId: inspection.task.taskId,
          idempotencyKey: inspection.prepareIdempotencyKey,
          authorizedAt: AUTHORIZED_AT,
        }),
        /local owner scope changed/,
      );
      await rm(copiedBase, { recursive: true, force: true });

      const currentWorkPath = path.join(
        fixture.taskMapRoot,
        TASKMAP_FIXED_ARTIFACT_NAMES.currentWork,
      );
      await chmod(currentWorkPath, 0o644);
      await assert.rejects(
        inspectTaskMapLocalApproval({
          taskMapRoot: fixture.taskMapRoot,
          ownerRoot: fixture.ownerRoot,
        }),
        /owner-only bounded regular file/,
      );
      await chmod(currentWorkPath, 0o600);
      const peer = path.join(fixture.base, "hardlink-peer.json");
      await link(currentWorkPath, peer);
      await assert.rejects(
        inspectTaskMapLocalApproval({
          taskMapRoot: fixture.taskMapRoot,
          ownerRoot: fixture.ownerRoot,
        }),
        /owner-only bounded regular file/,
      );
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("fails closed on malformed, unsafe, symlinked, and cross-owner current artifacts", async () => {
    const malformedFixture = await createFixture();
    try {
      const { inspection } = await inspectAndPrepare(malformedFixture);
      const authorizationPath = path.join(
        malformedFixture.executionRoot,
        `authorization_${inspection.prepareIdempotencyKey}.json`,
      );
      await writeFile(authorizationPath, "{", { mode: 0o600 });
      await chmod(authorizationPath, 0o600);
      await assert.rejects(
        inspectTaskMapLocalApproval({
          taskMapRoot: malformedFixture.taskMapRoot,
          ownerRoot: malformedFixture.ownerRoot,
        }),
        /approval authorization is not valid JSON/,
      );
    } finally {
      await rm(malformedFixture.base, { recursive: true, force: true });
    }

    const modeFixture = await createFixture();
    try {
      const { inspection } = await inspectAndPrepare(modeFixture);
      const authorizationPath = path.join(
        modeFixture.executionRoot,
        `authorization_${inspection.prepareIdempotencyKey}.json`,
      );
      await chmod(authorizationPath, 0o644);
      await assert.rejects(
        inspectTaskMapLocalApproval({
          taskMapRoot: modeFixture.taskMapRoot,
          ownerRoot: modeFixture.ownerRoot,
        }),
        /approval authorization is not an owner-only bounded regular file/,
      );
    } finally {
      await rm(modeFixture.base, { recursive: true, force: true });
    }

    const symlinkFixture = await createFixture();
    try {
      const { inspection } = await inspectAndPrepare(symlinkFixture);
      const authorizationPath = path.join(
        symlinkFixture.executionRoot,
        `authorization_${inspection.prepareIdempotencyKey}.json`,
      );
      const peerPath = path.join(symlinkFixture.base, "authorization-peer.json");
      await writeFile(peerPath, await readFile(authorizationPath), { mode: 0o600 });
      await rm(authorizationPath);
      await symlink(peerPath, authorizationPath);
      await assert.rejects(
        inspectTaskMapLocalApproval({
          taskMapRoot: symlinkFixture.taskMapRoot,
          ownerRoot: symlinkFixture.ownerRoot,
        }),
        /approval authorization is not an owner-only bounded regular file/,
      );
    } finally {
      await rm(symlinkFixture.base, { recursive: true, force: true });
    }

    const sourceFixture = await createFixture();
    const targetFixture = await createFixture();
    try {
      const source = await inspectAndPrepare(sourceFixture);
      const target = await inspectTaskMapLocalApproval({
        taskMapRoot: targetFixture.taskMapRoot,
        ownerRoot: targetFixture.ownerRoot,
      });
      await mkdir(targetFixture.executionRoot, { mode: 0o700 });
      await writeFile(
        path.join(
          targetFixture.executionRoot,
          `authorization_${target.inspection.prepareIdempotencyKey}.json`,
        ),
        await readFile(path.join(
          sourceFixture.executionRoot,
          `authorization_${source.inspection.prepareIdempotencyKey}.json`,
        )),
        { mode: 0o600 },
      );
      await assert.rejects(
        inspectTaskMapLocalApproval({
          taskMapRoot: targetFixture.taskMapRoot,
          ownerRoot: targetFixture.ownerRoot,
        }),
        /approval authorization conflicts with the current proof/,
      );
    } finally {
      await rm(sourceFixture.base, { recursive: true, force: true });
      await rm(targetFixture.base, { recursive: true, force: true });
    }
  });

  it("derives deterministic M4A handoff bytes from the exact prepared M3 chain without mutation", async () => {
    const fixture = await createFixture();
    try {
      const quartetBefore = await quartetDigests(fixture);
      const { prepared } = await inspectAndPrepare(fixture);
      const executionFiles = (await readdir(fixture.executionRoot)).sort();
      const executionDigests = Object.fromEntries(await Promise.all(
        executionFiles.map(async (name) => [
          name,
          sha256(await readFile(path.join(fixture.executionRoot, name))),
        ]),
      ));

      const first = await inspectTaskMapAgentHandoff({
        taskMapRoot: fixture.taskMapRoot,
        ownerRoot: fixture.ownerRoot,
      });
      const second = await inspectTaskMapAgentHandoff({
        taskMapRoot: fixture.taskMapRoot,
        ownerRoot: fixture.ownerRoot,
      });

      assert.deepEqual(second, first);
      assert.equal(
        taskMapContractCanonicalJson(second.manifest),
        taskMapContractCanonicalJson(first.manifest),
      );
      assert.equal(
        first.manifest.contractVersion,
        TASKMAP_AGENT_HANDOFF_MANIFEST_VERSION,
      );
      assert.equal(
        first.manifest.preparation.approvalAuthorizationDigest,
        prepared.authorization.approvalAuthorizationDigest,
      );
      assert.equal(
        first.manifest.preparation.packageDigest,
        prepared.package.packageDigest,
      );
      assert.equal(
        first.manifest.preparation.preparationReceiptDigest,
        prepared.receipt.preparationReceiptDigest,
      );
      assert.deepEqual(
        first.manifest.runtimeRequest,
        TASKMAP_AGENT_HANDOFF_RUNTIME_REQUEST_V1,
      );
      assert.deepEqual(first.manifest.dryRunReturnPlan.actions, []);
      assert.equal(first.manifest.dryRunReturnPlan.state, "dry_run");
      assert.equal(
        first.manifest.dryRunReturnPlan.sourceMutationAuthorized,
        false,
      );
      assert.deepEqual(
        first.manifest.dryRunReturnPlan.primaryTarget,
        prepared.package.task.returnTarget,
      );
      assert.deepEqual(first.manifest.boundary, {
        state: "prepared_not_dispatched",
        dispatchAuthorized: false,
        processStartAuthorized: false,
        codexTaskStartAuthorized: false,
        taskCreated: false,
        codexTaskId: null,
        deliveryStatus: "not_started",
        returnActionExecutionAuthorized: false,
        sourceCompletionAuthorized: false,
        outcomeVerificationAuthorized: false,
      });
      assert.deepEqual(first.manifest.privacy, {
        sourceBodiesStored: false,
        localPathsStored: false,
        rawBiometricsStored: false,
        ownerIdentityStored: false,
        credentialsStored: false,
        participantIdentitiesStored: false,
        unboundedWorkspaceContextStored: false,
      });
      assert.deepEqual(first.summary, {
        contractVersion: TASKMAP_AGENT_HANDOFF_SUMMARY_VERSION,
        status: "handoff_ready",
        handoffManifestId: first.manifest.handoffManifestId,
        handoffManifestDigest: first.manifest.handoffManifestDigest,
        boundPackageDigest: prepared.package.packageDigest,
        routeIdempotencyKey: first.manifest.routeIdempotencyKey,
        runtimeRequest: TASKMAP_AGENT_HANDOFF_RUNTIME_REQUEST_V1,
        returnPlan: {
          mode: "dry_run_only",
          returnActionsAuthorized: false,
          sourceWritebackAuthorized: false,
        },
        codexTaskCreated: false,
        codexTaskId: null,
        codexTaskStartAuthorized: false,
        dispatchAuthorized: false,
      });
      assert.deepEqual((await readdir(fixture.executionRoot)).sort(), executionFiles);
      assert.deepEqual(
        Object.fromEntries(await Promise.all(
          executionFiles.map(async (name) => [
            name,
            sha256(await readFile(path.join(fixture.executionRoot, name))),
          ]),
        )),
        executionDigests,
      );
      assert.deepEqual(await quartetDigests(fixture), quartetBefore);
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("rejects M4A handoff inspection while the exact M3 package awaits approval", async () => {
    const fixture = await createFixture();
    try {
      const quartetBefore = await quartetDigests(fixture);
      await assert.rejects(
        inspectTaskMapAgentHandoff({
          taskMapRoot: fixture.taskMapRoot,
          ownerRoot: fixture.ownerRoot,
        }),
        /exact M3 package is not ready/,
      );
      assert.deepEqual(await quartetDigests(fixture), quartetBefore);
      await assert.rejects(
        lstat(fixture.executionRoot),
        (error: NodeJS.ErrnoException) => error.code === "ENOENT",
      );
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("exposes bounded full and summary M4A CLI reads only through the fixed command surface", async () => {
    const fixture = await createFixture();
    const dependencies = {
      environment: {
        [TASKMAP_AGENT_HANDOFF_TEST_MODE_ENV]: "1",
      },
    };
    try {
      await inspectAndPrepare(fixture);
      assert.deepEqual(
        parseTaskMapAgentHandoffCliArguments([
          "inspect-summary",
          "--test-owner-root",
          fixture.ownerRoot,
        ], dependencies),
        {
          command: "inspect-summary",
          ownerRoot: fixture.ownerRoot,
          taskMapRoot: fixture.taskMapRoot,
        },
      );

      const manifest = await runTaskMapAgentHandoffCli([
        "inspect",
        "--test-owner-root",
        fixture.ownerRoot,
      ], dependencies);
      const summary = await runTaskMapAgentHandoffCli([
        "inspect-summary",
        "--test-owner-root",
        fixture.ownerRoot,
      ], dependencies);
      assert.equal(
        manifest.contractVersion,
        TASKMAP_AGENT_HANDOFF_MANIFEST_VERSION,
      );
      assert.equal(
        summary.contractVersion,
        TASKMAP_AGENT_HANDOFF_SUMMARY_VERSION,
      );
      if (
        manifest.contractVersion !== TASKMAP_AGENT_HANDOFF_MANIFEST_VERSION
        || summary.contractVersion !== TASKMAP_AGENT_HANDOFF_SUMMARY_VERSION
      ) {
        assert.fail("M4A CLI returned the wrong contract");
      }
      assert.equal(summary.status, "handoff_ready");
      assert.equal(summary.handoffManifestId, manifest.handoffManifestId);
      assert.equal(summary.handoffManifestDigest, manifest.handoffManifestDigest);
      assert.equal(summary.boundPackageDigest, manifest.preparation.packageDigest);
      assert.equal(summary.routeIdempotencyKey, manifest.routeIdempotencyKey);

      const manifestOutput = taskMapAgentHandoffCliOutput(manifest);
      const summaryOutput = taskMapAgentHandoffCliOutput(summary);
      assert.equal(
        manifestOutput,
        `${taskMapContractCanonicalJson(manifest)}\n`,
      );
      assert.equal(
        summaryOutput,
        `${taskMapContractCanonicalJson(summary)}\n`,
      );
      assert.ok(
        Buffer.byteLength(manifestOutput, "utf8")
        <= TASKMAP_AGENT_HANDOFF_LIMITS_V1.maxManifestBytes,
      );
      assert.ok(
        Buffer.byteLength(summaryOutput, "utf8")
        <= TASKMAP_AGENT_HANDOFF_LIMITS_V1.maxSummaryBytes,
      );

      await assert.rejects(
        runTaskMapAgentHandoffCli([
          "inspect-summary",
          "--test-owner-root",
          fixture.ownerRoot,
        ]),
        /CLI input is invalid/,
      );
      assert.throws(
        () => parseTaskMapAgentHandoffCliArguments([
          "inspect",
          "--model",
          "another-model",
        ], dependencies),
        /CLI input is invalid/,
      );
      assert.throws(
        () => taskMapAgentHandoffCliOutput({
          ...manifest,
          task: {
            ...manifest.task,
            outcome: "x".repeat(
              TASKMAP_AGENT_HANDOFF_LIMITS_V1.maxManifestBytes,
            ),
          },
        }),
        /exceeded its bound/,
      );
      assert.throws(
        () => taskMapAgentHandoffCliOutput({
          ...summary,
          handoffManifestId: "x".repeat(
            TASKMAP_AGENT_HANDOFF_LIMITS_V1.maxSummaryBytes,
          ),
        }),
        /exceeded its bound/,
      );
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("inspects and prepares each projection-bound ready target through one CLI collection", async () => {
    const fixture = await createTwoTargetFixture();
    const dependencies = {
      environment: {
        TASKMAP_LOCAL_APPROVAL_TEST_MODE: "1",
      },
    };
    try {
      const legacyInspect = await runTaskMapLocalApprovalCli([
        "inspect",
        "--test-owner-root",
        fixture.ownerRoot,
      ], dependencies);
      assert.equal(legacyInspect.taskId, fixture.targetTaskId);

      const firstInspect = await runTaskMapLocalApprovalCli([
        "inspect",
        "--test-owner-root",
        fixture.ownerRoot,
        "--task-id",
        fixture.targetTaskId,
      ], dependencies);
      const secondInspect = await runTaskMapLocalApprovalCli([
        "inspect",
        "--test-owner-root",
        fixture.ownerRoot,
        "--task-id",
        fixture.secondTaskId,
      ], dependencies);
      assert.equal(firstInspect.status, "ready_for_approval");
      assert.equal(secondInspect.status, "ready_for_approval");
      assert.equal(firstInspect.taskId, fixture.targetTaskId);
      assert.equal(secondInspect.taskId, fixture.secondTaskId);
      assert.equal(legacyInspect.proofDigest, firstInspect.proofDigest);
      assert.notEqual(firstInspect.proofDigest, secondInspect.proofDigest);
      assert.notEqual(
        firstInspect.prepareIdempotencyKey,
        secondInspect.prepareIdempotencyKey,
      );

      const firstPrepared = await runTaskMapLocalApprovalCli([
        "approve-prepare",
        "--test-owner-root",
        fixture.ownerRoot,
        "--expected-owner-scope-digest",
        firstInspect.localOwnerScopeDigest,
        "--expected-proof-digest",
        firstInspect.proofDigest,
        "--task-id",
        firstInspect.taskId,
        "--idempotency-key",
        firstInspect.prepareIdempotencyKey,
        "--authorized-at",
        AUTHORIZED_AT,
      ], dependencies);
      const secondPrepared = await runTaskMapLocalApprovalCli([
        "approve-prepare",
        "--test-owner-root",
        fixture.ownerRoot,
        "--expected-owner-scope-digest",
        secondInspect.localOwnerScopeDigest,
        "--expected-proof-digest",
        secondInspect.proofDigest,
        "--task-id",
        secondInspect.taskId,
        "--idempotency-key",
        secondInspect.prepareIdempotencyKey,
        "--authorized-at",
        "2026-07-29T12:06:00.000Z",
      ], dependencies);
      assert.equal(firstPrepared.status, "package_ready");
      assert.equal(secondPrepared.status, "package_ready");
      assert.notEqual(firstPrepared.packageId, secondPrepared.packageId);
      assert.equal(firstPrepared.noDispatch, true);
      assert.equal(secondPrepared.noDispatch, true);
      assert.equal(firstPrepared.sourceCompletion, false);
      assert.equal(secondPrepared.outcomeVerified, false);

      const restartedFirst = await runTaskMapLocalApprovalCli([
        "inspect",
        "--test-owner-root",
        fixture.ownerRoot,
        "--task-id",
        fixture.targetTaskId,
      ], dependencies);
      const restartedSecond = await runTaskMapLocalApprovalCli([
        "inspect",
        "--test-owner-root",
        fixture.ownerRoot,
        "--task-id",
        fixture.secondTaskId,
      ], dependencies);
      assert.deepEqual(restartedFirst, firstPrepared);
      assert.deepEqual(restartedSecond, secondPrepared);
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("closes predecessor A, then approves and prepares successor B from the sealed terminal frontier", async () => {
    const fixture = await createTerminalPredecessorFixture();
    const approvalDependencies = {
      environment: {
        TASKMAP_LOCAL_APPROVAL_TEST_MODE: "1",
      },
    };
    const sessionId = "22222222-2222-4222-8222-222222222222";
    try {
      const firstInspection = await runTaskMapLocalApprovalCli([
        "inspect",
        "--test-owner-root",
        fixture.ownerRoot,
        "--task-id",
        fixture.targetTaskId,
      ], approvalDependencies);
      const firstPrepared = await runTaskMapLocalApprovalCli([
        "approve-prepare",
        "--test-owner-root",
        fixture.ownerRoot,
        "--expected-owner-scope-digest",
        firstInspection.localOwnerScopeDigest,
        "--expected-proof-digest",
        firstInspection.proofDigest,
        "--task-id",
        firstInspection.taskId,
        "--idempotency-key",
        firstInspection.prepareIdempotencyKey,
        "--authorized-at",
        AUTHORIZED_AT,
      ], approvalDependencies);
      assert.equal(firstPrepared.status, "package_ready");
      assert.ok(firstPrepared.artifactAccess?.packagePath);
      const firstPackage = JSON.parse(await readFile(
        firstPrepared.artifactAccess.packagePath,
        "utf8",
      )) as TaskMapLocalExecutionPackageV1;
      const lifecycle = await inspectTaskMapLocalLifecycleContext({
        taskMapRoot: fixture.taskMapRoot,
        ownerRoot: fixture.ownerRoot,
      });
      const completionDependencies = {
        environment: {
          TASKMAP_LOCAL_COMPLETION_TEST_MODE: "1",
        },
        loadPredecessorEvidence: async () => ({
          binding: {
            runId: lifecycle.projection.runId,
            inputDigest: lifecycle.projection.inputDigest,
            projectionDigest: lifecycle.currentness.projectionDigest,
            projectionFileDigest: lifecycle.projectionFileDigest,
            currentnessFileDigest: lifecycle.currentnessFileDigest,
          },
          taskMapInput: { events: [] },
        }) as never,
        inspectExecution: async () => ({
          contractVersion: "taskmap-agent-execution-inspection.v1",
          sessionId,
          progressState: "report_ready",
          sessionStatus: "finished",
          packageId: firstPackage.packageId,
          packageDigest: firstPackage.packageDigest,
          preflightId: null,
          preflightDigest: null,
          taskId: fixture.targetTaskId,
          rootId: firstPackage.task.rootId,
          workspaceBindingDigest: "2".repeat(64),
          launchedAdapter: "codex_cli",
          startedAt: "2026-07-29T12:06:00.000Z",
          finishedAt: "2026-07-29T12:07:00.000Z",
          artifactCount: 1,
          artifactReceiptDigest: "3".repeat(64),
          reportReceiptDigest: "4".repeat(64),
          reportRelativePaths: ["report.md", "report.html"],
          sourceWritebackAttempted: false,
          sourceCompletion: false,
          outcomeVerified: false,
        }) as never,
      };
      const closed = await runTaskMapLocalCompletionCli([
        "close",
        "--test-owner-root",
        fixture.ownerRoot,
        "--task-id",
        fixture.targetTaskId,
        "--session-id",
        sessionId,
        "--decided-at",
        "2026-07-29T12:08:00.000Z",
      ], completionDependencies);
      assert.equal(closed.status, "closed_in_daobrew");
      assert.deepEqual(closed.readyTaskIds, [fixture.secondTaskId]);

      const secondInspection = await runTaskMapLocalApprovalCli([
        "inspect",
        "--test-owner-root",
        fixture.ownerRoot,
        "--task-id",
        fixture.secondTaskId,
      ], approvalDependencies);
      assert.equal(secondInspection.status, "ready_for_approval");
      const secondPrepared = await runTaskMapLocalApprovalCli([
        "approve-prepare",
        "--test-owner-root",
        fixture.ownerRoot,
        "--expected-owner-scope-digest",
        secondInspection.localOwnerScopeDigest,
        "--expected-proof-digest",
        secondInspection.proofDigest,
        "--task-id",
        secondInspection.taskId,
        "--idempotency-key",
        secondInspection.prepareIdempotencyKey,
        "--authorized-at",
        "2026-07-29T12:09:00.000Z",
      ], approvalDependencies);
      assert.equal(secondPrepared.status, "package_ready");
      assert.equal(secondPrepared.taskId, fixture.secondTaskId);
      assert.equal(secondPrepared.noDispatch, true);
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("revalidates the selected ready target before preparation and rejects proof drift", async () => {
    const fixture = await createTwoTargetFixture();
    const dependencies = {
      environment: {
        TASKMAP_LOCAL_APPROVAL_TEST_MODE: "1",
      },
    };
    try {
      const inspected = await runTaskMapLocalApprovalCli([
        "inspect",
        "--test-owner-root",
        fixture.ownerRoot,
        "--task-id",
        fixture.secondTaskId,
      ], dependencies);
      const currentness = JSON.parse(await readFile(
        path.join(
          fixture.taskMapRoot,
          TASKMAP_FIXED_ARTIFACT_NAMES.currentness,
        ),
        "utf8",
      )) as TaskMapNativeCurrentnessForWorkV1;
      const ready = JSON.parse(await readFile(
        path.join(
          fixture.taskMapRoot,
          TASKMAP_READY_PROOF_TARGETS_FILENAME,
        ),
        "utf8",
      )) as { proofTargets: TaskMapReadyFrontierProofTargetV1[] };
      await writeReadyProofTargets(
        fixture.taskMapRoot,
        fixture.projection,
        currentness,
        ready.proofTargets.map((target) => (
          target.taskId === fixture.secondTaskId
            ? {
                ...structuredClone(target),
                outcome: "The selected bounded outcome changed before approval.",
              }
            : structuredClone(target)
        )),
      );

      await assert.rejects(
        runTaskMapLocalApprovalCli([
          "approve-prepare",
          "--test-owner-root",
          fixture.ownerRoot,
          "--expected-owner-scope-digest",
          inspected.localOwnerScopeDigest,
          "--expected-proof-digest",
          inspected.proofDigest,
          "--task-id",
          inspected.taskId,
          "--idempotency-key",
          inspected.prepareIdempotencyKey,
          "--authorized-at",
          AUTHORIZED_AT,
        ], dependencies),
        /approval request does not match the current proof/,
      );
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("rejects prepare after terminal completion until explicit Reopen", async () => {
    const fixture = await createTwoTargetFixture();
    const approvalDependencies = {
      environment: {
        TASKMAP_LOCAL_APPROVAL_TEST_MODE: "1",
      },
    };
    const completionDependencies = {
      environment: {
        TASKMAP_LOCAL_COMPLETION_TEST_MODE: "1",
      },
    };
    try {
      await mkdir(fixture.executionRoot, { mode: 0o700 });
      const inspected = await runTaskMapLocalApprovalCli([
        "inspect",
        "--test-owner-root",
        fixture.ownerRoot,
        "--task-id",
        fixture.secondTaskId,
      ], approvalDependencies);
      await runTaskMapLocalCompletionCli([
        "complete-elsewhere",
        "--test-owner-root",
        fixture.ownerRoot,
        "--task-id",
        fixture.secondTaskId,
        "--decided-at",
        AUTHORIZED_AT,
      ], completionDependencies);

      const prepareArguments = [
        "approve-prepare",
        "--test-owner-root",
        fixture.ownerRoot,
        "--expected-owner-scope-digest",
        inspected.localOwnerScopeDigest,
        "--expected-proof-digest",
        inspected.proofDigest,
        "--task-id",
        inspected.taskId,
        "--idempotency-key",
        inspected.prepareIdempotencyKey,
        "--authorized-at",
        "2026-07-29T12:06:00.000Z",
      ];
      await assert.rejects(
        runTaskMapLocalApprovalCli(
          prepareArguments,
          approvalDependencies,
        ),
        /active terminal disposition; explicit Reopen is required/,
      );

      await runTaskMapLocalCompletionCli([
        "reopen",
        "--test-owner-root",
        fixture.ownerRoot,
        "--task-id",
        fixture.secondTaskId,
        "--decided-at",
        "2026-07-29T12:07:00.000Z",
      ], completionDependencies);
      const prepared = await runTaskMapLocalApprovalCli(
        prepareArguments,
        approvalDependencies,
      );
      assert.equal(prepared.status, "package_ready");
      assert.equal(prepared.taskId, fixture.secondTaskId);
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("serializes concurrent external completion ahead of package preparation", async () => {
    const fixture = await createTwoTargetFixture();
    try {
      await mkdir(fixture.executionRoot, { mode: 0o700 });
      const inspected = await runTaskMapLocalApprovalCli([
        "inspect",
        "--test-owner-root",
        fixture.ownerRoot,
        "--task-id",
        fixture.secondTaskId,
      ], {
        environment: { TASKMAP_LOCAL_APPROVAL_TEST_MODE: "1" },
      });

      let lifecycleReadCount = 0;
      let releaseLockedRead!: () => void;
      let announceLockedRead!: () => void;
      const lockedReadStarted = new Promise<void>((resolve) => {
        announceLockedRead = resolve;
      });
      const lockedReadRelease = new Promise<void>((resolve) => {
        releaseLockedRead = resolve;
      });
      const completion = runTaskMapLocalCompletionCli([
        "complete-elsewhere",
        "--test-owner-root",
        fixture.ownerRoot,
        "--task-id",
        fixture.secondTaskId,
        "--decided-at",
        AUTHORIZED_AT,
      ], {
        environment: { TASKMAP_LOCAL_COMPLETION_TEST_MODE: "1" },
        inspectLifecycleContext: async (input) => {
          const context = await inspectTaskMapLocalLifecycleContext(input);
          lifecycleReadCount += 1;
          if (lifecycleReadCount === 2) {
            announceLockedRead();
            await lockedReadRelease;
          }
          return context;
        },
      });
      await lockedReadStarted;

      const prepare = runTaskMapLocalApprovalCli([
        "approve-prepare",
        "--test-owner-root",
        fixture.ownerRoot,
        "--expected-owner-scope-digest",
        inspected.localOwnerScopeDigest,
        "--expected-proof-digest",
        inspected.proofDigest,
        "--task-id",
        inspected.taskId,
        "--idempotency-key",
        inspected.prepareIdempotencyKey,
        "--authorized-at",
        "2026-07-29T12:06:00.000Z",
      ], {
        environment: { TASKMAP_LOCAL_APPROVAL_TEST_MODE: "1" },
      });
      const prepareRejection = assert.rejects(
        prepare,
        /active terminal disposition; explicit Reopen is required/,
      );
      releaseLockedRead();

      assert.equal((await completion).status, "completed_elsewhere");
      await prepareRejection;
      assert.deepEqual(
        (await readdir(fixture.executionRoot))
          .filter((name) => name.startsWith("authorization_")
            || name.startsWith("package_")
            || name.startsWith("receipt_")),
        [],
      );
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("completes externally from lifecycle context without approval artifacts", async () => {
    const fixture = await createTwoTargetFixture();
    try {
      await mkdir(fixture.executionRoot, { mode: 0o700 });
      await Promise.all([
        rm(path.join(
          fixture.taskMapRoot,
          TASKMAP_FIXED_ARTIFACT_NAMES.currentWork,
        )),
        rm(path.join(
          fixture.taskMapRoot,
          TASKMAP_FIXED_ARTIFACT_NAMES.body,
        )),
        rm(path.join(
          fixture.taskMapRoot,
          TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment,
        )),
      ]);

      const completed = await runTaskMapLocalCompletionCli([
        "complete-elsewhere",
        "--test-owner-root",
        fixture.ownerRoot,
        "--task-id",
        fixture.secondTaskId,
        "--decided-at",
        AUTHORIZED_AT,
      ], {
        environment: {
          TASKMAP_LOCAL_COMPLETION_TEST_MODE: "1",
        },
      });
      assert.equal(completed.status, "completed_elsewhere");
      assert.ok(
        completed.completedElsewhereTaskIds.includes(fixture.secondTaskId),
        "the explicitly selected stable task/work/source identity is terminal",
      );
      assert.equal(completed.sessionId, null);
      assert.equal(completed.sourceCompletion, false);
      assert.equal(completed.outcomeVerified, false);
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("rejects a resealed ready-target collection bound to another projection", async () => {
    const fixture = await createTwoTargetFixture();
    const dependencies = {
      environment: {
        TASKMAP_LOCAL_APPROVAL_TEST_MODE: "1",
      },
    };
    try {
      const readyPath = path.join(
        fixture.taskMapRoot,
        TASKMAP_READY_PROOF_TARGETS_FILENAME,
      );
      const ready = JSON.parse(await readFile(readyPath, "utf8")) as Record<
        string,
        unknown
      >;
      const core: Record<string, unknown> = {
        ...ready,
        projection: {
          ...(ready.projection as Record<string, unknown>),
          projectionDigest: "0".repeat(64),
        },
      };
      delete core.artifactDigest;
      await writePrivateJson(readyPath, {
        ...core,
        artifactDigest: taskMapContractDigest({
          domain: "taskmap-ready-proof-targets.1",
          ...core,
        }),
      }, true);

      await assert.rejects(
        runTaskMapLocalApprovalCli([
          "inspect",
          "--test-owner-root",
          fixture.ownerRoot,
          "--task-id",
          fixture.secondTaskId,
        ], dependencies),
        /ready proof targets are not bound to the current projection/,
      );
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("exposes one bounded inspect then approve-prepare CLI flow", async () => {
    const fixture = await createFixture();
    const dependencies = {
      environment: {
        TASKMAP_LOCAL_APPROVAL_TEST_MODE: "1",
      },
    };
    try {
      const inspect = await runTaskMapLocalApprovalCli([
        "inspect",
        "--test-owner-root",
        fixture.ownerRoot,
      ], dependencies);
      assert.equal(inspect.status, "ready_for_approval");
      assert.equal(inspect.approvalRecorded, false);
      assert.equal(inspect.deliveryStatus, "not_started");
      await assert.rejects(
        runTaskMapLocalApprovalCli([
          "inspect",
          "--test-owner-root",
          fixture.ownerRoot,
          "--task-id",
          inspect.taskId,
        ], dependencies),
        /ready proof targets are missing/,
      );
      const prepared = await runTaskMapLocalApprovalCli([
        "approve-prepare",
        "--test-owner-root",
        fixture.ownerRoot,
        "--expected-owner-scope-digest",
        inspect.localOwnerScopeDigest,
        "--expected-proof-digest",
        inspect.proofDigest,
        "--task-id",
        inspect.taskId,
        "--idempotency-key",
        inspect.prepareIdempotencyKey,
        "--authorized-at",
        AUTHORIZED_AT,
      ], dependencies);
      assert.equal(prepared.status, "package_ready");
      assert.equal(prepared.approvalRecorded, true);
      assert.equal(prepared.deliveryStatus, "not_started");
      assert.equal(prepared.taskStarted, false);
      assert.equal(prepared.noDispatch, true);
      assert.equal(prepared.sourceCompletion, false);
      assert.equal(prepared.outcomeVerified, false);
      const restartedInspect = await runTaskMapLocalApprovalCli([
        "inspect",
        "--test-owner-root",
        fixture.ownerRoot,
      ], dependencies);
      assert.deepEqual(restartedInspect, prepared);
      const output = taskMapLocalApprovalCliOutput(prepared);
      assert.equal(output, `${taskMapContractCanonicalJson(prepared)}\n`);
      assert.ok(Buffer.byteLength(output, "utf8") < 16 * 1024);
      await assert.rejects(
        runTaskMapLocalApprovalCli([
          "inspect",
          "--test-owner-root",
          fixture.ownerRoot,
        ]),
        /CLI input is invalid/,
      );
      await assert.rejects(
        runTaskMapLocalApprovalCli([
          "approve-prepare",
          "--test-owner-root",
          fixture.ownerRoot,
          "--expected-owner-scope-digest",
          inspect.localOwnerScopeDigest,
          "--expected-proof-digest",
          inspect.proofDigest,
          "--task-id",
          inspect.taskId,
          "--idempotency-key",
          inspect.prepareIdempotencyKey,
          "--authorized-at",
          "2026-07-29T12:05:00Z",
        ], dependencies),
        /CLI input is invalid/,
      );
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });
});
