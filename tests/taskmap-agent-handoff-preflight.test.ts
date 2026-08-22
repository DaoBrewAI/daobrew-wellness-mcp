import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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

import {
  buildTaskMapAgentHandoffPreflightSummary,
  buildTaskMapAgentWorkspaceBinding,
  buildTaskMapOperationalCriteriaAssessment,
  inspectTaskMapAgentHandoffPreflight,
  TASKMAP_AGENT_HANDOFF_PREFLIGHT_SUMMARY_VERSION,
  TASKMAP_AGENT_HANDOFF_PREFLIGHT_VERSION,
  type InspectTaskMapAgentHandoffPreflightInputV1,
  type TaskMapOperationalCriterionState,
} from "../src/engine/taskmap/agent-handoff-preflight.js";
import {
  inspectTaskMapAgentAdapterHandoffPreflight,
  TASKMAP_AGENT_ADAPTER_HANDOFF_PREFLIGHT_VERSION,
} from "../src/engine/taskmap/agent-handoff-preflight.js";
import {
  parseTaskMapAgentHandoffPreflightCliArguments,
  TASKMAP_AGENT_HANDOFF_PREFLIGHT_CLI_TEST_MODE_ENV,
} from "../src/engine/taskmap/agent-handoff-preflight-cli.js";
import { inspectTaskMapAgentHandoff } from "../src/engine/taskmap/agent-handoff-manifest.js";
import { buildTaskMapBodyContextDisclosure } from "../src/engine/taskmap/body-context.js";
import {
  buildTaskMapExactProvenance,
  taskMapCanonicalRepositoryRowDigest,
  type TaskMapExactProvenanceCurrentnessV1,
} from "../src/engine/taskmap/exact-provenance-companion.js";
import {
  buildTaskMapProjection,
  taskMapInputDigest,
  taskMapProjectionArtifactValidationReasons,
  taskMapSemanticInputDigest,
} from "../src/engine/taskmap/harness.js";
import {
  approveAndPrepareTaskMapLocalPackage,
  inspectTaskMapLocalApprovalOperationalContext,
  TASKMAP_FIXED_ARTIFACT_NAMES,
} from "../src/engine/taskmap/local-approval-package.js";
import {
  buildTaskMapSourceEnvelope,
  buildTaskMapSourceSnapshot,
  diffTaskMapProjections,
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "../src/engine/taskmap/source-contracts.js";
import {
  TASKMAP_CONTRACT_VERSION,
  type SemanticBrainOutput,
  type TaskMapInput,
  type TaskMapProjectionV1,
} from "../src/engine/taskmap/types.js";
import {
  TASKMAP_BODY_SIGNAL_ASSESSMENT_VERSION,
  TASKMAP_BODY_SIGNAL_WORK_SOURCE_LABEL_BY_KIND,
  type TaskMapBodySignalAssessmentV1,
} from "../src/engine/taskmap/native-refresh-service.js";

const GENERATED_AT = "2026-07-29T12:00:00.000Z";
const AUTHORIZED_AT = "2026-07-29T12:05:00.000Z";
const COMMIT = "09262e4637bd6d0e59a2fd3dba5fc7d5fc501c57";
const REPOSITORY_PATH = "tasks/TASKS.md";
const OWNER_MIGRATION_TASK_ID = "tmt_5dd23eaa9cc8c250";
const OWNER_MIGRATION_TASK_TITLE = "Build the migration blocker ledger";
const ADAPTER_VERSION = "strategy-row-adapter.1";
const ADAPTER_POLICY_DIGEST = taskMapContractDigest({
  version: ADAPTER_VERSION,
  binding: "explicit-pointer-to-immutable-row",
});

type FixtureMode = "ready" | "reverse_route" | "blocking_predecessor";

interface Fixture {
  base: string;
  ownerRoot: string;
  taskMapRoot: string;
  executionRoot: string;
  input: TaskMapInput;
  projection: TaskMapProjectionV1;
  currentness: TaskMapExactProvenanceCurrentnessV1;
  targetTaskId: string;
  strategyPointerIds: string[];
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sourceRef(pointerId: string): string {
  return taskMapContractDigest(`source:${pointerId}`);
}

function inputFixture(mode: FixtureMode): TaskMapInput {
  const strategyPointers = [
    {
      id: "strategy-task",
      sourceObjectId: "task-safe-ref",
      ref: "task:target",
      title: "Prepare the local execution package",
    },
    ...(mode === "blocking_predecessor"
      ? [{
          id: "strategy-predecessor",
          sourceObjectId: "predecessor-safe-ref",
          ref: "task:predecessor",
          title: "Finish the blocking source task",
        }]
      : []),
  ];
  return {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    generatedAt: GENERATED_AT,
    pointers: [
      ...strategyPointers.map((row) => ({
        id: row.id,
        sourceKind: "strategy" as const,
        sourceObjectId: row.sourceObjectId,
        sourceRefHash: sourceRef(row.id),
        canonicalUrl:
          `https://github.com/DaoBrewAI/DaoBrewStrategy/blob/${COMMIT}/${REPOSITORY_PATH}`,
        sourceVersion: COMMIT,
        authority: "source_system" as const,
        syncMode: "return_only" as const,
        capabilities: ["read_task" as const, "deep_link" as const],
      })),
      {
        id: "meeting-context",
        sourceKind: "granola",
        sourceObjectId: "meeting-safe-ref",
        sourceRefHash: sourceRef("meeting-context"),
        authority: "none",
        syncMode: "reference_only",
        capabilities: ["read_context"],
      },
      {
        id: "body-context",
        sourceKind: "oura",
        sourceObjectId: "relative-window",
        sourceRefHash: sourceRef("body-context"),
        authority: "none",
        syncMode: "reference_only",
        capabilities: ["read_context"],
      },
    ],
    events: [
      ...strategyPointers.map((row, index) => ({
        id: index === 0 ? "task-created" : "predecessor-created",
        pointerId: row.id,
        recordKind: "authoritative_task" as const,
        activity: "task_created" as const,
        occurredAt: `2026-07-2${8 - index}T10:00:00.000Z`,
        observedAt: GENERATED_AT,
        objectRefs: [row.ref],
        title: row.title,
        summary: "One explicit source-owned task row.",
        extractionConfidence: 1,
        sourceStatus: "open" as const,
      })),
      {
        id: "meeting-context-event",
        pointerId: "meeting-context",
        recordKind: "work_context",
        activity: "context_observed",
        occurredAt: "2026-07-29T10:00:00.000Z",
        observedAt: GENERATED_AT,
        dayKey: "2026-07-29",
        objectRefs: ["meeting:safe-ref"],
        title: "Bounded approval context",
        summary: "This unversioned context cannot prove execution provenance.",
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

function brainFixture(
  input: TaskMapInput,
  mode: FixtureMode,
): SemanticBrainOutput {
  const hasPredecessor = mode === "blocking_predecessor";
  return {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    provider: "codex",
    model: "gpt-5.6-sol",
    promptHash: taskMapContractDigest(`preflight:${mode}`),
    inputDigest: taskMapSemanticInputDigest(input),
    generatedAt: GENERATED_AT,
    roots: [{
      proposalId: "root",
      title: "Local approval and package",
      summary: "Prepare one exact package under explicit human approval.",
      evidenceEventIds: [
        "task-created",
        "meeting-context-event",
        ...(hasPredecessor ? ["predecessor-created"] : []),
      ],
      memberObjectRefs: [
        "task:target",
        "meeting:safe-ref",
        ...(hasPredecessor ? ["task:predecessor"] : []),
      ],
      confidence: 1,
    }],
    tasks: [
      {
        proposalId: "task",
        rootProposalId: "root",
        title: "Prepare the local execution package",
        summary: "Prepare one exact package without dispatch or source mutation.",
        evidenceEventIds: ["task-created", "meeting-context-event"],
        authoritativeTaskEventId: "task-created",
        openState: "open",
        confidence: 1,
      },
      ...(hasPredecessor
        ? [{
            proposalId: "predecessor",
            rootProposalId: "root",
            title: "Finish the blocking source task",
            summary: "This open predecessor blocks the target task.",
            evidenceEventIds: ["predecessor-created"],
            authoritativeTaskEventId: "predecessor-created",
            openState: "open" as const,
            confidence: 1,
          }]
        : []),
    ],
    edges: [
      {
        proposalId: "edge-target",
        fromProposalId:
          mode === "reverse_route" ? "task" : "root",
        toProposalId:
          mode === "reverse_route" ? "root" : "task",
        relation: "advances",
        evidenceEventIds: ["task-created"],
        confidence: 1,
      },
      ...(hasPredecessor
        ? [
            {
              proposalId: "edge-predecessor-root",
              fromProposalId: "root",
              toProposalId: "predecessor",
              relation: "advances" as const,
              evidenceEventIds: ["predecessor-created"],
              confidence: 1,
            },
            {
              proposalId: "edge-blocking",
              fromProposalId: "task",
              toProposalId: "predecessor",
              relation: "depends_on" as const,
              evidenceEventIds: ["predecessor-created"],
              confidence: 1,
            },
          ]
        : []),
    ],
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
  return projection.rejections.length === 0 ? projection : baseline;
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

function predecessors(
  projection: TaskMapProjectionV1,
  targetTaskId: string,
) {
  const taskById = new Map(projection.tasks.map((task) => [task.id, task]));
  return projection.edges.flatMap((edge) => {
    const predecessorId =
      edge.relation === "depends_on" && edge.from === targetTaskId
        ? edge.to
        : edge.relation === "blocks" && edge.to === targetTaskId
          ? edge.from
          : undefined;
    if (predecessorId === undefined) return [];
    const task = taskById.get(predecessorId);
    assert.ok(task);
    return [{
      taskId: task.id,
      relation: edge.relation as "depends_on" | "blocks",
      reviewState: task.reviewState,
      openState: task.openState,
    }];
  }).sort((left, right) => left.taskId.localeCompare(right.taskId));
}

function currentWork(
  projection: TaskMapProjectionV1,
  targetTaskId: string,
  override: {
    outcome?: string;
    inputSummary?: string;
    doneDefinition?: string[];
  } = {},
): Record<string, unknown> {
  const task = projection.tasks.find((row) => row.id === targetTaskId)!;
  const root = projection.roots.find((row) => row.id === task.rootId)!;
  const projectionDigest =
    diffTaskMapProjections(null, projection).currentProjectionDigest;
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
  const core = {
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
      outcome: override.outcome
        ?? "An immutable approval-bound package is ready locally.",
      input: {
        summary: override.inputSummary
          ?? "Use only the exact accepted projection and current work.",
        contextPointerIds,
      },
      predecessors: predecessors(projection, task.id),
      doneDefinition: override.doneDefinition ?? [
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
  return {
    ...core,
    artifactDigest: taskMapContractDigest(core),
  };
}

function bodySignalAssessment(
  projection: TaskMapProjectionV1,
  currentness: TaskMapExactProvenanceCurrentnessV1,
): TaskMapBodySignalAssessmentV1 {
  const projectionDigest =
    diffTaskMapProjections(null, projection).currentProjectionDigest;
  assert.deepEqual(
    {
      runId: currentness.runId,
      inputDigest: currentness.inputDigest,
      projectionDigest: currentness.projectionDigest,
    },
    {
      runId: projection.runId,
      inputDigest: projection.inputDigest,
      projectionDigest,
    },
    "body-signal assessment fixture must match currentness",
  );
  const matchedDate = "2026-07-29";
  const base: Omit<TaskMapBodySignalAssessmentV1, "artifactDigest"> = {
    contractVersion: TASKMAP_BODY_SIGNAL_ASSESSMENT_VERSION,
    projection: {
      runId: projection.runId,
      inputDigest: projection.inputDigest,
      projectionDigest,
    },
    physiologicalSnapshotDigest: taskMapContractDigest({
      fixture: "taskmap-agent-handoff-preflight",
      generatedAt: GENERATED_AT,
    }),
    assessedAt: GENERATED_AT,
    sourceFamily: "physiological",
    signal: {
      axis: "composite_recovery",
      displayName: "Readiness + Sleep",
      comparison: "relative_to_recent_personal_range",
      targetCategory: "below_baseline",
    },
    coverage: {
      startDay: "2026-07-01",
      endDay: matchedDate,
      classifiedDays: 1,
      unknownDays: 0,
    },
    roots: projection.roots
      .map((root) => ({
        rootId: root.id,
        relationship: "not_established" as const,
        observedSignalDates: [matchedDate],
        matchedWorkDates: [matchedDate],
        matchedWorkSources: [
          TASKMAP_BODY_SIGNAL_WORK_SOURCE_LABEL_BY_KIND.granola,
        ],
        matchedDateCount: 1,
        signalSummary:
          "Readiness + Sleep was below your recent personal range on 2026-07-29 within 2026-07-01 through 2026-07-29.",
        relevanceSummary:
          "The overlap appeared on fewer than three days, so no repeated relationship is shown.",
        reasonCode: "insufficient_target_backed_days" as const,
      }))
      .sort((left, right) => left.rootId.localeCompare(right.rootId)),
    boundary:
      "Body-informed context only. Association is not proof of cause.",
    privacy: {
      rawBiometricsStored: false,
      sourceBodiesStored: false,
      localPathsStored: false,
      providerIdentityStored: false,
    },
  };
  return {
    ...base,
    artifactDigest: taskMapContractDigest(base),
  };
}

async function createFixture(mode: FixtureMode = "ready"): Promise<Fixture> {
  const base = await realpath(
    await mkdtemp(path.join(tmpdir(), "taskmap-agent-preflight-")),
  );
  const ownerRoot = path.join(base, "owner");
  const taskMapRoot = path.join(ownerRoot, "taskmap");
  const executionRoot = path.join(ownerRoot, "taskmap-local-execution");
  await mkdir(taskMapRoot, { recursive: true, mode: 0o700 });
  await chmod(ownerRoot, 0o700);
  await chmod(taskMapRoot, 0o700);
  const input = inputFixture(mode);
  const projection = acceptedProjection(input, brainFixture(input, mode));
  assert.deepEqual(
    taskMapProjectionArtifactValidationReasons(projection),
    [],
    `invalid ${mode} projection`,
  );
  assert.equal(projection.rejections.length, 0, `rejected ${mode} projection`);
  assert.equal(
    projection.inputDigest,
    taskMapInputDigest(input),
    `input mismatch for ${mode}`,
  );
  const target = projection.tasks.find(
    (task) => task.taskHomePointerId === "strategy-task",
  )!;
  const projectionDigest =
    diffTaskMapProjections(null, projection).currentProjectionDigest;
  const currentness: TaskMapExactProvenanceCurrentnessV1 = {
    contractVersion: "taskmap-native-currentness-gate.v1",
    runId: projection.runId,
    inputDigest: projection.inputDigest,
    projectionDigest,
    taskDispositions: projection.tasks.map((task) => ({
      taskId: task.id,
      disposition: "current",
    })),
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
      currentWork(projection, target.id),
      true,
    ),
    writePrivateJson(
      path.join(taskMapRoot, TASKMAP_FIXED_ARTIFACT_NAMES.body),
      body,
    ),
    writePrivateJson(
      path.join(taskMapRoot, TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment),
      bodySignalAssessment(projection, currentness),
      true,
    ),
  ]);
  return {
    base,
    ownerRoot,
    taskMapRoot,
    executionRoot,
    input,
    projection,
    currentness,
    targetTaskId: target.id,
    strategyPointerIds: projection.tasks
      .map((task) => task.taskHomePointerId)
      .filter((pointerId): pointerId is string =>
        pointerId?.startsWith("strategy-") === true
      ),
  };
}

function buildProvenance(
  fixture: Fixture,
  ownerScopeDigest: string,
  currentnessFileDigest: string,
  overrides: {
    adapterVersion?: string;
    adapterPolicyDigest?: string;
    rowSuffix?: string;
  } = {},
) {
  const adapterVersion = overrides.adapterVersion ?? ADAPTER_VERSION;
  const adapterPolicyDigest =
    overrides.adapterPolicyDigest ?? ADAPTER_POLICY_DIGEST;
  const envelopes = fixture.strategyPointerIds.map((pointerId, index) => {
    const canonicalRowDigest = taskMapCanonicalRepositoryRowDigest({
      repositoryRelativePath: REPOSITORY_PATH,
      sourceObjectId: pointerId,
      rowText:
        `| P0 | **Source task ${index}** | Owner | Done ${overrides.rowSuffix ?? ""} |`,
    });
    return buildTaskMapSourceEnvelope({
      ownerScopeDigest,
      binding: {
        connectionId: "strategy-read",
        sourceKind: "strategy",
        tenantOrWorkspaceDigest: taskMapContractDigest("strategy-repository"),
        accountOrPrincipalDigest: ownerScopeDigest,
        grantVersion: "strategy-read-v1",
      },
      sourceKind: "strategy",
      objectType: "authoritative_task",
      sourceObjectId: pointerId,
      sourceRevision: COMMIT,
      eventTime: "2026-07-28T10:00:00.000Z",
      contentDigest: canonicalRowDigest,
      authority: {
        evidence: "authoritative_task",
        quality: "source_native",
        lifecycle: "source_status",
        completion: "source_status",
        rank: "accepted_work",
      },
    });
  });
  const sourceSnapshot = buildTaskMapSourceSnapshot(envelopes, []);
  const taskByPointer = new Map(
    fixture.projection.tasks.map((task) => [task.taskHomePointerId, task]),
  );
  const expectedProvenance = {
    sourceSnapshotDigest: sourceSnapshot.sourceSnapshotDigest,
    adapterVersion,
    adapterPolicyDigest,
  };
  return {
    expectedProvenance,
    artifact: buildTaskMapExactProvenance({
      projection: fixture.projection,
      currentness: fixture.currentness,
      currentnessFileDigest,
      expectedSourceSnapshotDigest:
        expectedProvenance.sourceSnapshotDigest,
      expectedAdapterVersion: adapterVersion,
      expectedAdapterPolicyDigest: adapterPolicyDigest,
      sourceSnapshot,
      taskBindings: fixture.strategyPointerIds.map((pointerId, index) => ({
        taskId: taskByPointer.get(pointerId)!.id,
        sourceEnvelopeId: envelopes[index]!.envelopeId,
        repositoryRelativePath: REPOSITORY_PATH,
        adapterVersion,
        adapterPolicyDigest,
      })),
    }),
  };
}

async function preparedInput(
  fixture: Fixture,
  states: TaskMapOperationalCriterionState[] = ["met", "unmet", "met"],
) {
  const before = await inspectTaskMapLocalApprovalOperationalContext({
    taskMapRoot: fixture.taskMapRoot,
    ownerRoot: fixture.ownerRoot,
  });
  await approveAndPrepareTaskMapLocalPackage({
    taskMapRoot: fixture.taskMapRoot,
    ownerRoot: fixture.ownerRoot,
    executionRoot: fixture.executionRoot,
    expectedOwnerScopeDigest: before.inspection.localOwnerScopeDigest,
    expectedProofDigest: before.inspection.proofDigest,
    taskId: before.inspection.task.taskId,
    idempotencyKey: before.inspection.prepareIdempotencyKey,
    authorizedAt: AUTHORIZED_AT,
  });
  const handoff = await inspectTaskMapAgentHandoff({
    taskMapRoot: fixture.taskMapRoot,
    ownerRoot: fixture.ownerRoot,
  });
  const local = await inspectTaskMapLocalApprovalOperationalContext({
    taskMapRoot: fixture.taskMapRoot,
    ownerRoot: fixture.ownerRoot,
  });
  const provenance = buildProvenance(
    fixture,
    local.inspection.localOwnerScopeDigest,
    local.inspection.quartet.currentnessFileDigest,
  );
  const workspaceBinding = buildTaskMapAgentWorkspaceBinding({
    projectId: `tmproject_${taskMapContractDigest("project")}`,
    repositoryIdentityDigest: taskMapContractDigest("repository"),
    workspaceRevisionDigest: taskMapContractDigest("workspace-revision"),
  });
  assert.equal(states.length, handoff.manifest.task.doneDefinition.length);
  const criteriaAssessment = buildTaskMapOperationalCriteriaAssessment({
    handoffManifestDigest: handoff.manifest.handoffManifestDigest,
    operationalContextDigest: local.context.contextDigest,
    exactProvenanceDigest: provenance.artifact.artifactDigest,
    workspaceBindingDigest: workspaceBinding.bindingDigest,
    workspaceRevisionDigest: workspaceBinding.workspaceRevisionDigest,
    currentWorkArtifactDigest:
      local.inspection.quartet.currentWorkArtifactDigest,
    taskId: handoff.manifest.task.taskId,
    rootId: handoff.manifest.task.rootId,
    doneDefinition: handoff.manifest.task.doneDefinition,
    criteria: states.map((state, criterionIndex) => ({
      criterionIndex,
      state,
      evidenceDigest: taskMapContractDigest({
        criterionIndex,
        state,
        workspaceRevisionDigest: workspaceBinding.workspaceRevisionDigest,
      }),
    })),
  });
  const input: InspectTaskMapAgentHandoffPreflightInputV1 = {
    taskMapRoot: fixture.taskMapRoot,
    ownerRoot: fixture.ownerRoot,
    exactProvenance: provenance.artifact,
    expectedProvenance: provenance.expectedProvenance,
    expectedOperational: {
      workspaceBindingDigest: workspaceBinding.bindingDigest,
      criteriaAssessmentDigest: criteriaAssessment.assessmentDigest,
    },
    workspaceBinding,
    criteriaAssessment,
  };
  return {
    input,
    local,
    handoff,
    provenance,
    workspaceBinding,
    criteriaAssessment,
  };
}

async function fileSnapshot(root: string): Promise<Record<string, string>> {
  const names = (await readdir(root)).sort();
  return Object.fromEntries(await Promise.all(names.map(async (name) => [
    name,
    sha256(await readFile(path.join(root, name))),
  ])));
}

async function fixedQuartetSnapshot(
  taskMapRoot: string,
): Promise<Record<string, string>> {
  return Object.fromEntries(await Promise.all(
    Object.values(TASKMAP_FIXED_ARTIFACT_NAMES).map(async (name) => [
      name,
      sha256(await readFile(path.join(taskMapRoot, name))),
    ]),
  ));
}

function buildOwnerExactProvenance(input: {
  projection: TaskMapProjectionV1;
  currentness: TaskMapExactProvenanceCurrentnessV1;
  currentnessFileDigest: string;
  strategyRepo: string;
  ownerScopeDigest: string;
}) {
  const sourceText = execFileSync(
    "git",
    ["-C", input.strategyRepo, "show", `${COMMIT}:${REPOSITORY_PATH}`],
    { encoding: "utf8" },
  );
  const eventTime = execFileSync(
    "git",
    ["-C", input.strategyRepo, "show", "-s", "--format=%cI", COMMIT],
    { encoding: "utf8" },
  ).trim();
  const selectors = new Map([
    ["ptr-strategy-source-aware-e2e", "**Source-aware E2E**"],
    [
      "ptr-strategy-connector-session-foundation",
      "**Connector + session foundation**",
    ],
    [
      "ptr-strategy-taskmap-product-prototype",
      "**Task Map product prototype**",
    ],
    [
      "ptr-strategy-migration-blocker-ledger",
      "**Migration blocker ledger**",
    ],
    [
      "ptr-strategy-meeting-capture-workflow",
      "**Meeting capture workflow**",
    ],
    ["ptr-strategy-spc-application", "SPC 申请"],
    ["ptr-strategy-nyx-contact-onepager", "NYX intro"],
    ["ptr-strategy-yc-closeout", "YC 状态收尾"],
    ["ptr-strategy-market-test-ledger", "Market-test ledger"],
  ]);
  const adapterVersion = "strategy-owner-pointer-row-attestation.1";
  const adapterPolicyDigest = taskMapContractDigest({
    version: adapterVersion,
    commit: COMMIT,
    repositoryRelativePath: REPOSITORY_PATH,
    selectors: [...selectors].sort(([left], [right]) =>
      left.localeCompare(right)
    ),
    mappingAuthority: "adapter_attested_not_source_native",
  });
  const binding = {
    connectionId: "strategy-owner-read",
    sourceKind: "strategy" as const,
    tenantOrWorkspaceDigest: taskMapContractDigest("DaoBrewStrategy"),
    accountOrPrincipalDigest: input.ownerScopeDigest,
    grantVersion: "strategy-immutable-git-read-v1",
  };
  const currentTaskIds = new Set(
    input.currentness.taskDispositions
      .filter((row) => row.disposition === "current")
      .map((row) => row.taskId),
  );
  const tasks = input.projection.tasks
    .filter((task) => currentTaskIds.has(task.id))
    .sort((left, right) => left.id.localeCompare(right.id));
  assert.equal(tasks.length, 9);
  const lines = sourceText.replace(/\r\n?/g, "\n").split("\n");
  const envelopeByTask = tasks.map((task) => {
    const pointerId = task.taskHomePointerId;
    assert.ok(pointerId);
    const selector = selectors.get(pointerId);
    assert.ok(selector);
    const rows = lines.filter(
      (line) => line.startsWith("|") && line.includes(selector),
    );
    assert.equal(rows.length, 1);
    const envelope = buildTaskMapSourceEnvelope({
      ownerScopeDigest: input.ownerScopeDigest,
      binding,
      sourceKind: "strategy",
      objectType: "authoritative_task",
      sourceObjectId: pointerId,
      sourceRevision: COMMIT,
      eventTime,
      contentDigest: taskMapCanonicalRepositoryRowDigest({
        repositoryRelativePath: REPOSITORY_PATH,
        sourceObjectId: pointerId,
        rowText: rows[0]!,
      }),
      authority: {
        evidence: "authoritative_task",
        quality: "source_native",
        lifecycle: "source_status",
        completion: "source_status",
        rank: "accepted_work",
      },
    });
    return { taskId: task.id, envelope };
  });
  const sourceSnapshot = buildTaskMapSourceSnapshot(
    envelopeByTask.map((row) => row.envelope),
    [],
  );
  const expectedProvenance = {
    sourceSnapshotDigest: sourceSnapshot.sourceSnapshotDigest,
    adapterVersion,
    adapterPolicyDigest,
  };
  return {
    expectedProvenance,
    artifact: buildTaskMapExactProvenance({
      projection: input.projection,
      currentness: input.currentness,
      currentnessFileDigest: input.currentnessFileDigest,
      expectedSourceSnapshotDigest:
        expectedProvenance.sourceSnapshotDigest,
      expectedAdapterVersion: adapterVersion,
      expectedAdapterPolicyDigest: adapterPolicyDigest,
      sourceSnapshot,
      taskBindings: envelopeByTask.map((row) => ({
        taskId: row.taskId,
        sourceEnvelopeId: row.envelope.envelopeId,
        repositoryRelativePath: REPOSITORY_PATH,
        adapterVersion,
        adapterPolicyDigest,
      })),
    }),
  };
}

function ownerMigrationLedgerAbsenceDigest(strategyRepo: string): string {
  const sourceTree = execFileSync(
    "git",
    ["-C", strategyRepo, "rev-parse", `${COMMIT}^{tree}`],
    { encoding: "utf8" },
  ).trim();
  const mentions = execFileSync(
    "git",
    [
      "-C",
      strategyRepo,
      "grep",
      "-il",
      "-E",
      "Migration blocker ledger|migration blockers|legacy graph.*ghost.*fixture",
      COMMIT,
      "--",
    ],
    { encoding: "utf8" },
  ).trim().split("\n").filter(Boolean).map((row) => (
    row.startsWith(`${COMMIT}:`) ? row.slice(COMMIT.length + 1) : row
  )).sort();
  const dedicatedArtifacts = mentions.filter((relativePath) => (
    relativePath !== "tasks/TASKS.md"
    && !relativePath.startsWith("meetings/")
    && !relativePath.startsWith("graphify-out/")
  ));
  assert.deepEqual(dedicatedArtifacts, []);
  return taskMapContractDigest({
    domain: "taskmap-m4p-owner-unfinished-check.1",
    sourceCommit: COMMIT,
    sourceTree,
    mentionPathDigests: mentions.map((relativePath) =>
      taskMapContractDigest(relativePath)
    ),
    excludedMentionClasses: [
      "task_queue",
      "meeting_context",
      "generated_graph",
    ],
    dedicatedArtifactCount: 0,
    criterionState: "unmet",
  });
}

describe("Task Map agent handoff preflight", () => {
  it("replays one readable exact-provenance unfinished handoff without starting work", async () => {
    const fixture = await createFixture();
    try {
      const prepared = await preparedInput(fixture);
      const quartetBefore = await fileSnapshot(fixture.taskMapRoot);
      const executionBefore = await fileSnapshot(fixture.executionRoot);
      const first = await inspectTaskMapAgentHandoffPreflight(prepared.input);
      const second = await inspectTaskMapAgentHandoffPreflight(prepared.input);
      const summary = buildTaskMapAgentHandoffPreflightSummary(
        first,
        prepared.handoff.manifest,
      );

      assert.deepEqual(second, first);
      assert.equal(summary.preflightDigest, first.preflightDigest);
      assert.equal(
        summary.packageDigest,
        prepared.handoff.manifest.preparation.packageDigest,
      );
      assert.equal(
        summary.workspaceBindingDigest,
        first.workspaceBinding.bindingDigest,
      );
      assert.equal(
        summary.criteriaAssessmentDigest,
        first.criteriaAssessment.assessmentDigest,
      );
      assert.deepEqual(summary.runtimeRequest, first.runtimeRequest);
      assert.equal(summary.startIdempotencyKey, first.startIdempotencyKey);
      const staleDigestManifest = structuredClone(prepared.handoff.manifest);
      const forgedPackageDigest = taskMapContractDigest({
        domain: "taskmap-synthetic-forged-package-stale-manifest.1",
        packageDigest:
          prepared.handoff.manifest.preparation.packageDigest,
      });
      staleDigestManifest.preparation.packageDigest = forgedPackageDigest;
      staleDigestManifest.preparation.packageId =
        `tmlocalpackage_${forgedPackageDigest}`;
      assert.throws(
        () => buildTaskMapAgentHandoffPreflightSummary(
          first,
          staleDigestManifest,
        ),
        /M4A handoff manifest digest is invalid/,
      );
      assert.equal(
        first.contractVersion,
        TASKMAP_AGENT_HANDOFF_PREFLIGHT_VERSION,
      );
      assert.equal(first.task.taskTitle, "Prepare the local execution package");
      assert.equal(first.task.rootTitle, "Local approval and package");
      assert.equal(first.boundary.state, "validated_not_started");
      assert.equal(first.boundary.taskCreated, false);
      assert.equal(first.boundary.codexTaskStartAuthorized, false);
      assert.equal(first.boundary.sourceWritebackAuthorized, false);
      assert.equal(
        first.provenance.expectedSourceSnapshotDigest,
        prepared.input.expectedProvenance.sourceSnapshotDigest,
      );
      assert.equal(
        first.provenance.expectedAdapterPolicyDigest,
        ADAPTER_POLICY_DIGEST,
      );
      assert.deepEqual(
        first.provenance.excludedUnversionedContextPointerIds,
        ["meeting-context"],
      );
      assert.equal(first.provenance.routeEdgeDerivationDigests.length, 1);
      assert.equal(first.privacy.localPathsStored, false);
      const serialized = taskMapContractCanonicalJson(first);
      assert.ok(!serialized.includes(fixture.base));
      assert.ok(!serialized.includes("meeting-safe-ref"));
      assert.ok(!serialized.includes("Provider-specific raw values"));
      assert.deepEqual(await fileSnapshot(fixture.taskMapRoot), quartetBefore);
      assert.deepEqual(await fileSnapshot(fixture.executionRoot), executionBefore);
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("derives distinct bounded Codex and Claude Code preflights from one owner-proven package", async () => {
    const fixture = await createFixture();
    try {
      const prepared = await preparedInput(fixture);
      const quartetBefore = await fileSnapshot(fixture.taskMapRoot);
      const executionBefore = await fileSnapshot(fixture.executionRoot);
      const codex = await inspectTaskMapAgentAdapterHandoffPreflight({
        adapter: "codex",
        preflightInput: prepared.input,
      });
      const claude = await inspectTaskMapAgentAdapterHandoffPreflight({
        adapter: "claude_code",
        preflightInput: prepared.input,
      });

      assert.equal(
        codex.contractVersion,
        TASKMAP_AGENT_ADAPTER_HANDOFF_PREFLIGHT_VERSION,
      );
      assert.equal(
        claude.contractVersion,
        TASKMAP_AGENT_ADAPTER_HANDOFF_PREFLIGHT_VERSION,
      );
      assert.equal(codex.runtimeRequest.operation, "create_fresh_codex_task");
      assert.equal(
        claude.runtimeRequest.operation,
        "create_fresh_claude_code_session",
      );
      assert.notEqual(codex.adapterPreflightDigest, claude.adapterPreflightDigest);
      assert.equal(codex.packageDigest, claude.packageDigest);
      assert.equal(codex.corePreflightDigest, claude.corePreflightDigest);
      assert.equal(codex.boundary.state, "validated_not_started");
      assert.equal(claude.boundary.state, "validated_not_started");
      assert.equal(codex.boundary.processStartAuthorized, false);
      assert.equal(claude.boundary.processStartAuthorized, false);
      assert.equal(codex.boundary.adapterSessionStartAuthorized, false);
      assert.equal(claude.boundary.adapterSessionStartAuthorized, false);
      assert.equal(codex.boundary.adapterSessionId, null);
      assert.equal(claude.boundary.adapterSessionId, null);
      assert.deepEqual(await fileSnapshot(fixture.taskMapRoot), quartetBefore);
      assert.deepEqual(await fileSnapshot(fixture.executionRoot), executionBefore);

      const forged = structuredClone(prepared.input);
      forged.expectedProvenance.sourceSnapshotDigest =
        taskMapContractDigest("forged-owner-package-proof");
      await assert.rejects(
        inspectTaskMapAgentAdapterHandoffPreflight({
          adapter: "claude_code",
          preflightInput: forged,
        }),
        /source snapshot does not match the externally expected digest/,
      );
      await assert.rejects(
        inspectTaskMapAgentAdapterHandoffPreflight({
          adapter: "cursor" as never,
          preflightInput: prepared.input,
        }),
        /adapter must be codex or claude_code/,
      );
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("rejects all-met, unknown, stale workspace, and external checker mismatches", async () => {
    const fixture = await createFixture();
    try {
      const ready = await preparedInput(fixture);
      const allMet = await preparedInput(fixture, ["met", "met", "met"]);
      await assert.rejects(
        inspectTaskMapAgentHandoffPreflight(allMet.input),
        /task is already satisfied/,
      );

      const rehashedCriteria = buildTaskMapOperationalCriteriaAssessment({
        handoffManifestDigest: ready.handoff.manifest.handoffManifestDigest,
        operationalContextDigest: ready.local.context.contextDigest,
        exactProvenanceDigest: ready.provenance.artifact.artifactDigest,
        workspaceBindingDigest: ready.workspaceBinding.bindingDigest,
        workspaceRevisionDigest:
          ready.workspaceBinding.workspaceRevisionDigest,
        currentWorkArtifactDigest:
          ready.local.inspection.quartet.currentWorkArtifactDigest,
        taskId: ready.handoff.manifest.task.taskId,
        rootId: ready.handoff.manifest.task.rootId,
        doneDefinition: ready.handoff.manifest.task.doneDefinition,
        criteria: ready.criteriaAssessment.criteria.map((criterion) => (
          criterion.criterionIndex === 1
            ? {
                ...criterion,
                evidenceDigest:
                  taskMapContractDigest("coordinated-evidence-rehash"),
              }
            : { ...criterion }
        )),
      });
      await assert.rejects(
        inspectTaskMapAgentHandoffPreflight({
          ...ready.input,
          criteriaAssessment: rehashedCriteria,
        }),
        /external checker expectation/,
      );

      const unknownAssessment = buildTaskMapOperationalCriteriaAssessment({
        handoffManifestDigest: allMet.handoff.manifest.handoffManifestDigest,
        operationalContextDigest: allMet.local.context.contextDigest,
        exactProvenanceDigest: allMet.provenance.artifact.artifactDigest,
        workspaceBindingDigest: allMet.workspaceBinding.bindingDigest,
        workspaceRevisionDigest:
          allMet.workspaceBinding.workspaceRevisionDigest,
        currentWorkArtifactDigest:
          allMet.local.inspection.quartet.currentWorkArtifactDigest,
        taskId: allMet.handoff.manifest.task.taskId,
        rootId: allMet.handoff.manifest.task.rootId,
        doneDefinition: allMet.handoff.manifest.task.doneDefinition,
        criteria: allMet.handoff.manifest.task.doneDefinition.map(
          (_criterion, criterionIndex) => ({
            criterionIndex,
            state: criterionIndex === 1 ? "unknown" as const : "met" as const,
            evidenceDigest: taskMapContractDigest(`unknown:${criterionIndex}`),
          }),
        ),
      });
      await assert.rejects(
        inspectTaskMapAgentHandoffPreflight({
          ...allMet.input,
          criteriaAssessment: unknownAssessment,
          expectedOperational: {
            ...allMet.input.expectedOperational,
            criteriaAssessmentDigest: unknownAssessment.assessmentDigest,
          },
        }),
        /unfinishedness is unknown/,
      );

      const changedWorkspace = buildTaskMapAgentWorkspaceBinding({
        projectId: ready.workspaceBinding.projectId,
        repositoryIdentityDigest:
          ready.workspaceBinding.repositoryIdentityDigest,
        workspaceRevisionDigest: taskMapContractDigest("changed-workspace"),
      });
      const changedCriteria = buildTaskMapOperationalCriteriaAssessment({
        handoffManifestDigest: ready.handoff.manifest.handoffManifestDigest,
        operationalContextDigest: ready.local.context.contextDigest,
        exactProvenanceDigest: ready.provenance.artifact.artifactDigest,
        workspaceBindingDigest: changedWorkspace.bindingDigest,
        workspaceRevisionDigest: changedWorkspace.workspaceRevisionDigest,
        currentWorkArtifactDigest:
          ready.local.inspection.quartet.currentWorkArtifactDigest,
        taskId: ready.handoff.manifest.task.taskId,
        rootId: ready.handoff.manifest.task.rootId,
        doneDefinition: ready.handoff.manifest.task.doneDefinition,
        criteria: ready.criteriaAssessment.criteria.map((criterion) => ({
          ...criterion,
          evidenceDigest: taskMapContractDigest({
            priorEvidenceDigest: criterion.evidenceDigest,
            workspaceRevisionDigest: changedWorkspace.workspaceRevisionDigest,
          }),
        })),
      });
      await assert.rejects(
        inspectTaskMapAgentHandoffPreflight({
          ...ready.input,
          workspaceBinding: changedWorkspace,
          criteriaAssessment: changedCriteria,
        }),
        /external registry expectation/,
      );
      await assert.rejects(
        inspectTaskMapAgentHandoffPreflight({
          ...ready.input,
          workspaceBinding: changedWorkspace,
          expectedOperational: {
            ...ready.input.expectedOperational,
            workspaceBindingDigest: changedWorkspace.bindingDigest,
          },
        }),
        /criteria assessment is stale or invalid/,
      );
      await assert.rejects(
        inspectTaskMapAgentHandoffPreflight({
          ...allMet.input,
          expectedOperational: {
            ...allMet.input.expectedOperational,
            criteriaAssessmentDigest: "f".repeat(64),
          },
        }),
        /external checker expectation/,
      );
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("rejects coordinated provenance rehash and a reversed operational route", async () => {
    const fixture = await createFixture();
    try {
      const prepared = await preparedInput(fixture);
      const replacementPolicy = taskMapContractDigest("replacement-policy");
      const replacement = buildProvenance(
        fixture,
        prepared.local.inspection.localOwnerScopeDigest,
        prepared.local.inspection.quartet.currentnessFileDigest,
        {
          adapterVersion: "replacement-adapter.1",
          adapterPolicyDigest: replacementPolicy,
          rowSuffix: "replacement",
        },
      );
      await assert.rejects(
        inspectTaskMapAgentHandoffPreflight({
          ...prepared.input,
          exactProvenance: replacement.artifact,
        }),
        /source snapshot|adapter policy|expected/,
      );

      const reverseHandoff = structuredClone(prepared.handoff);
      reverseHandoff.manifest.task.routeNodeIds =
        [...reverseHandoff.manifest.task.routeNodeIds].reverse();
      const reverseLocal = structuredClone(prepared.local);
      reverseLocal.inspection.task.routeNodeIds =
        [...reverseLocal.inspection.task.routeNodeIds].reverse();
      await assert.rejects(
        inspectTaskMapAgentHandoffPreflight(prepared.input, {
          inspectHandoff: async () => reverseHandoff,
          inspectOperationalContext: async () => reverseLocal,
        }),
        /route is not uniquely backed by exact task-source evidence/,
      );
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("rejects blocking predecessors and a sequential package-read mismatch", async () => {
    const fixture = await createFixture();
    try {
      const prepared = await preparedInput(fixture);
      const blockedHandoff = structuredClone(prepared.handoff);
      const blockedLocal = structuredClone(prepared.local);
      const blockingPredecessor = {
        taskId: `tmt_${"b".repeat(16)}`,
        relation: "depends_on" as const,
        reviewState: "accepted",
        openState: "open",
      };
      blockedHandoff.manifest.task.predecessors = [blockingPredecessor];
      blockedLocal.inspection.task.predecessors = [blockingPredecessor];
      await assert.rejects(
        inspectTaskMapAgentHandoffPreflight(prepared.input, {
          inspectHandoff: async () => blockedHandoff,
          inspectOperationalContext: async () => blockedLocal,
        }),
        /blocking nonterminal predecessor/,
      );

      const supersededHandoff = structuredClone(prepared.handoff);
      const supersededLocal = structuredClone(prepared.local);
      const supersededWithoutReplacement = {
        ...blockingPredecessor,
        reviewState: "superseded",
        openState: "superseded",
      };
      supersededHandoff.manifest.task.predecessors = [
        supersededWithoutReplacement,
      ];
      supersededLocal.inspection.task.predecessors = [
        supersededWithoutReplacement,
      ];
      await assert.rejects(
        inspectTaskMapAgentHandoffPreflight(prepared.input, {
          inspectHandoff: async () => supersededHandoff,
          inspectOperationalContext: async () => supersededLocal,
        }),
        /blocking nonterminal predecessor/,
      );

      const terminalLocal = structuredClone(prepared.local);
      terminalLocal.context.task.reviewState = "source_complete";
      terminalLocal.context.task.openState = "completed";
      terminalLocal.context.task.sourceStatus = "completed";
      await assert.rejects(
        inspectTaskMapAgentHandoffPreflight(prepared.input, {
          inspectOperationalContext: async () => terminalLocal,
        }),
        /task is terminal or no longer operational/,
      );

      await assert.rejects(
        inspectTaskMapAgentHandoffPreflight(prepared.input, {
          inspectOperationalContext: async (input) => {
            const value =
              await inspectTaskMapLocalApprovalOperationalContext(input);
            assert.equal(value.response.status, "package_ready");
            return {
              ...value,
              response: {
                ...value.response,
                packageDigest: "f".repeat(64),
              },
            };
          },
        }),
        /do not share one exact package/,
      );

      const privateLocal = structuredClone(prepared.local);
      privateLocal.context.task.taskTitle = "/Users/neo/private-task";
      await assert.rejects(
        inspectTaskMapAgentHandoffPreflight(prepared.input, {
          inspectOperationalContext: async () => privateLocal,
        }),
        /privacy boundary/,
      );
    } finally {
      await rm(fixture.base, { recursive: true, force: true });
    }
  });

  it("preflights the real migration blocker ledger leaf from byte-identical owner inputs", {
    skip:
      process.env.TASKMAP_M4P_STRATEGY_REPO === undefined
      || process.env.TASKMAP_M4P_OWNER_TASKMAP_ROOT === undefined,
  }, async () => {
    const strategyRepo = await realpath(
      process.env.TASKMAP_M4P_STRATEGY_REPO!,
    );
    const ownerTaskMapRoot = await realpath(
      process.env.TASKMAP_M4P_OWNER_TASKMAP_ROOT!,
    );
    const ownerBefore = await fixedQuartetSnapshot(ownerTaskMapRoot);
    const base = await realpath(
      await mkdtemp(path.join(tmpdir(), "taskmap-owner-preflight-")),
    );
    const ownerRoot = path.join(base, "owner");
    const taskMapRoot = path.join(ownerRoot, "taskmap");
    const executionRoot = path.join(ownerRoot, "taskmap-local-execution");
    try {
      await mkdir(taskMapRoot, { recursive: true, mode: 0o700 });
      await chmod(ownerRoot, 0o700);
      await chmod(taskMapRoot, 0o700);
      const copiedNames = [
        TASKMAP_FIXED_ARTIFACT_NAMES.projection,
        TASKMAP_FIXED_ARTIFACT_NAMES.currentness,
        TASKMAP_FIXED_ARTIFACT_NAMES.body,
        TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment,
      ];
      const copiedBytes = new Map<string, Buffer>();
      for (const name of copiedNames) {
        const bytes = await readFile(path.join(ownerTaskMapRoot, name));
        copiedBytes.set(name, bytes);
        await writeFile(path.join(taskMapRoot, name), bytes, { mode: 0o600 });
        await chmod(path.join(taskMapRoot, name), 0o600);
      }
      const projection = JSON.parse(
        copiedBytes.get(TASKMAP_FIXED_ARTIFACT_NAMES.projection)!
          .toString("utf8"),
      ) as TaskMapProjectionV1;
      const currentness = JSON.parse(
        copiedBytes.get(TASKMAP_FIXED_ARTIFACT_NAMES.currentness)!
          .toString("utf8"),
      ) as TaskMapExactProvenanceCurrentnessV1;
      const target = projection.tasks.find(
        (task) => task.id === OWNER_MIGRATION_TASK_ID,
      );
      assert.ok(target);
      assert.equal(target.title, OWNER_MIGRATION_TASK_TITLE);
      assert.equal(target.reviewState, "accepted");
      assert.equal(target.openState, "open");
      assert.equal(target.sourceStatus, "open");
      assert.equal(target.taskHomePointerId,
        "ptr-strategy-migration-blocker-ledger");
      assert.equal(
        currentness.taskDispositions.find(
          (row) => row.taskId === target.id,
        )?.disposition,
        "current",
      );
      await writePrivateJson(
        path.join(taskMapRoot, TASKMAP_FIXED_ARTIFACT_NAMES.currentWork),
        currentWork(projection, target.id, {
          outcome:
            "A reviewed migration blocker ledger covers every legacy Task Map blocker.",
          inputSummary:
            "Use the exact Strategy task row and immutable source revision only.",
          doneDefinition: [
            "Every legacy graph, ghost, task, and fixture blocker into TaskMapProjection is listed.",
            "Every blocker has an explicit owner and exit test.",
            "No transcript or artifact body is moved and production data is unchanged.",
          ],
        }),
        true,
      );
      for (const name of copiedNames) {
        assert.equal(
          sha256(await readFile(path.join(taskMapRoot, name))),
          ownerBefore[name],
          `${name} must remain byte-identical in the temp root`,
        );
      }

      const before = await inspectTaskMapLocalApprovalOperationalContext({
        taskMapRoot,
        ownerRoot,
      });
      assert.equal(before.inspection.task.taskId, OWNER_MIGRATION_TASK_ID);
      const provenance = buildOwnerExactProvenance({
        projection,
        currentness,
        currentnessFileDigest:
          before.inspection.quartet.currentnessFileDigest,
        strategyRepo,
        ownerScopeDigest: before.inspection.localOwnerScopeDigest,
      });
      await approveAndPrepareTaskMapLocalPackage({
        taskMapRoot,
        ownerRoot,
        executionRoot,
        expectedOwnerScopeDigest: before.inspection.localOwnerScopeDigest,
        expectedProofDigest: before.inspection.proofDigest,
        taskId: OWNER_MIGRATION_TASK_ID,
        idempotencyKey: before.inspection.prepareIdempotencyKey,
        authorizedAt: AUTHORIZED_AT,
      });
      const handoff = await inspectTaskMapAgentHandoff({
        taskMapRoot,
        ownerRoot,
        expectedOwnerScopeDigest: before.inspection.localOwnerScopeDigest,
      });
      const local = await inspectTaskMapLocalApprovalOperationalContext({
        taskMapRoot,
        ownerRoot,
        expectedOwnerScopeDigest: before.inspection.localOwnerScopeDigest,
      });
      const repositoryHead = execFileSync(
        "git",
        ["rev-parse", "HEAD"],
        { cwd: process.cwd(), encoding: "utf8" },
      ).trim();
      const workspaceBinding = buildTaskMapAgentWorkspaceBinding({
        projectId: `tmproject_${taskMapContractDigest({
          domain: "taskmap-owner-project.1",
          taskId: OWNER_MIGRATION_TASK_ID,
        })}`,
        repositoryIdentityDigest: taskMapContractDigest({
          domain: "taskmap-owner-repository.1",
          repository: "DaobrewAI",
        }),
        workspaceRevisionDigest: taskMapContractDigest({
          domain: "taskmap-owner-workspace-revision.1",
          repositoryHead,
        }),
      });
      const absenceEvidenceDigest =
        ownerMigrationLedgerAbsenceDigest(strategyRepo);
      const criteriaAssessment =
        buildTaskMapOperationalCriteriaAssessment({
          handoffManifestDigest: handoff.manifest.handoffManifestDigest,
          operationalContextDigest: local.context.contextDigest,
          exactProvenanceDigest: provenance.artifact.artifactDigest,
          workspaceBindingDigest: workspaceBinding.bindingDigest,
          workspaceRevisionDigest: workspaceBinding.workspaceRevisionDigest,
          currentWorkArtifactDigest:
            local.inspection.quartet.currentWorkArtifactDigest,
          taskId: handoff.manifest.task.taskId,
          rootId: handoff.manifest.task.rootId,
          doneDefinition: handoff.manifest.task.doneDefinition,
          criteria: [
            {
              criterionIndex: 0,
              state: "unmet",
              evidenceDigest: absenceEvidenceDigest,
            },
            {
              criterionIndex: 1,
              state: "unmet",
              evidenceDigest: taskMapContractDigest({
                domain: "taskmap-owner-ledger-owner-exit-check.1",
                absenceEvidenceDigest,
              }),
            },
            {
              criterionIndex: 2,
              state: "met",
              evidenceDigest: taskMapContractDigest({
                domain: "taskmap-owner-ledger-privacy-check.1",
                currentWorkPrivacy: {
                  sourceBodiesStored: false,
                  localPathsStored: false,
                  rawBiometricsStored: false,
                },
                ownerQuartetDigest: taskMapContractDigest(ownerBefore),
              }),
            },
          ],
        });
      const preflight = await inspectTaskMapAgentHandoffPreflight({
        taskMapRoot,
        ownerRoot,
        expectedOwnerScopeDigest: before.inspection.localOwnerScopeDigest,
        exactProvenance: provenance.artifact,
        expectedProvenance: provenance.expectedProvenance,
        expectedOperational: {
          workspaceBindingDigest: workspaceBinding.bindingDigest,
          criteriaAssessmentDigest: criteriaAssessment.assessmentDigest,
        },
        workspaceBinding,
        criteriaAssessment,
      });
      const summary = buildTaskMapAgentHandoffPreflightSummary(
        preflight,
        handoff.manifest,
      );

      assert.equal(preflight.task.taskId, OWNER_MIGRATION_TASK_ID);
      assert.equal(preflight.task.taskTitle, OWNER_MIGRATION_TASK_TITLE);
      assert.deepEqual(preflight.task.routeNodeIds, [
        target.rootId,
        OWNER_MIGRATION_TASK_ID,
      ]);
      assert.equal(
        preflight.provenance.taskProof.pointerId,
        "ptr-strategy-migration-blocker-ledger",
      );
      assert.equal(preflight.provenance.taskProof.sourceRevision, COMMIT);
      assert.equal(
        preflight.provenance.taskProof.repositoryRelativePath,
        REPOSITORY_PATH,
      );
      assert.equal(preflight.criteriaAssessment.criteria[0]!.state, "unmet");
      assert.equal(preflight.boundary.state, "validated_not_started");
      assert.equal(preflight.boundary.dispatchAuthorized, false);
      assert.equal(preflight.boundary.processStartAuthorized, false);
      assert.equal(preflight.boundary.codexTaskStartAuthorized, false);
      assert.equal(preflight.boundary.taskCreated, false);
      assert.equal(preflight.boundary.codexTaskId, null);
      assert.equal(preflight.boundary.sourceWritebackAuthorized, false);
      assert.equal(preflight.boundary.sourceCompletionAuthorized, false);
      assert.equal(preflight.boundary.outcomeVerificationAuthorized, false);
      assert.equal(preflight.privacy.sourceBodiesStored, false);
      assert.equal(preflight.privacy.localPathsStored, false);
      assert.equal(preflight.privacy.rawBiometricsStored, false);
      assert.equal(
        summary.contractVersion,
        TASKMAP_AGENT_HANDOFF_PREFLIGHT_SUMMARY_VERSION,
      );
      assert.equal(summary.state, "validated_not_started");
      assert.equal(summary.preflightDigest, preflight.preflightDigest);
      assert.equal(
        summary.packageDigest,
        handoff.manifest.preparation.packageDigest,
      );
      assert.equal(summary.taskId, OWNER_MIGRATION_TASK_ID);
      assert.equal(
        summary.exactProvenanceDigest,
        provenance.artifact.artifactDigest,
      );
      assert.equal(
        summary.workspaceBindingDigest,
        preflight.workspaceBinding.bindingDigest,
      );
      assert.equal(
        summary.criteriaAssessmentDigest,
        criteriaAssessment.assessmentDigest,
      );
      assert.deepEqual(summary.runtimeRequest, preflight.runtimeRequest);
      assert.equal(
        summary.startIdempotencyKey,
        preflight.startIdempotencyKey,
      );
      assert.equal(summary.taskCreated, false);
      assert.equal(summary.codexTaskStartAuthorized, false);
      assert.equal(summary.dispatchAuthorized, false);
      assert.equal(summary.sourceWritebackAuthorized, false);
      assert.equal(summary.returnActionsAuthorized, false);
      assert.equal(summary.sourceCompletionAuthorized, false);
      assert.equal(summary.outcomeVerificationAuthorized, false);
      const staleDigestManifest = structuredClone(handoff.manifest);
      const forgedPackageDigest = taskMapContractDigest({
        domain: "taskmap-forged-package-for-stale-manifest-regression.1",
        packageDigest: handoff.manifest.preparation.packageDigest,
      });
      staleDigestManifest.preparation.packageDigest = forgedPackageDigest;
      staleDigestManifest.preparation.packageId =
        `tmlocalpackage_${forgedPackageDigest}`;
      assert.throws(
        () => buildTaskMapAgentHandoffPreflightSummary(
          preflight,
          staleDigestManifest,
        ),
        /M4A handoff manifest digest is invalid/,
      );
      const serialized = taskMapContractCanonicalJson(preflight);
      assert.ok(!serialized.includes(strategyRepo));
      assert.ok(!serialized.includes(ownerTaskMapRoot));
      assert.ok(!serialized.includes("列出 legacy graph"));
      assert.deepEqual(
        await fixedQuartetSnapshot(ownerTaskMapRoot),
        ownerBefore,
      );
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("parses only the closed picker-time adapter preflight CLI surface", () => {
    const ownerRoot = path.join(tmpdir(), "preflight-cli-owner");
    const packagePath = path.join(ownerRoot, "package_fixture.json");
    const workspacePath = path.join(tmpdir(), "preflight-cli-workspace");
    const ownerScopeDigest = taskMapContractDigest("preflight-cli-owner");
    const environment = {
      [TASKMAP_AGENT_HANDOFF_PREFLIGHT_CLI_TEST_MODE_ENV]: "1",
    };
    const parsed = parseTaskMapAgentHandoffPreflightCliArguments([
      "inspect",
      "--adapter", "codex",
      "--package", packagePath,
      "--workspace", workspacePath,
      "--test-owner-root", ownerRoot,
      "--test-owner-scope-digest", ownerScopeDigest,
    ], {
      environment,
    });

    assert.equal(parsed.adapter, "codex");
    assert.equal(parsed.packagePath, packagePath);
    assert.equal(parsed.workspacePath, workspacePath);
    assert.equal(parsed.ownerRoot, ownerRoot);
    assert.equal(parsed.taskMapRoot, path.join(ownerRoot, "taskmap"));
    assert.equal(parsed.expectedCandidateOwnerScopeDigest, ownerScopeDigest);
    for (const malformed of [
      ["inspect", "--adapter", "cursor", "--package", packagePath,
        "--workspace", workspacePath, "--test-owner-root", ownerRoot,
        "--test-owner-scope-digest", ownerScopeDigest],
      ["inspect", "--adapter", "claude_code", "--package", "relative.json",
        "--workspace", workspacePath, "--test-owner-root", ownerRoot,
        "--test-owner-scope-digest", ownerScopeDigest],
      ["inspect", "--adapter", "claude_code", "--package", packagePath,
        "--workspace", "relative", "--test-owner-root", ownerRoot,
        "--test-owner-scope-digest", ownerScopeDigest],
      ["inspect", "--adapter", "codex", "--package", packagePath,
        "--workspace", workspacePath, "--unknown", "value",
        "--test-owner-root", ownerRoot,
        "--test-owner-scope-digest", ownerScopeDigest],
    ]) {
      assert.throws(
        () => parseTaskMapAgentHandoffPreflightCliArguments(malformed, {
          environment,
        }),
        /invalid/,
      );
    }
  });
});
