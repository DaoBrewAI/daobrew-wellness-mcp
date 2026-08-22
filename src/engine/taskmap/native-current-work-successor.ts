import { taskMapProjectionPrivacyLeakReasons } from "./harness.js";
import {
  diffTaskMapProjections,
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";
import { taskMapNativeCandidateRevisionDigest }
  from "./native-candidate-review.js";
import type {
  TaskMapProjectionV1,
  TaskMapTask,
} from "./types.js";

export const TASKMAP_NATIVE_CURRENT_WORK_MAX_BYTES = 256 * 1_024;

const SHA256 = /^[a-f0-9]{64}$/;
const TASK_ID = /^tmt_[A-Za-z0-9._-]{1,256}$/;
const ROOT_ID = /^tmr_[A-Za-z0-9._-]{1,256}$/;
const STRICT_RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const MAX_TEXT_CHARACTERS = 4_096;
const MAX_CONTEXT_POINTERS = 128;
const MAX_DONE_ITEMS = 12;

type JsonObject = Record<string, unknown>;

export interface TaskMapNativeAgentSessionEpisodeAdmissionV1 {
  admission: "authenticated_fresh_agent_session";
  directive: "user_directive";
  userDirectiveSummary: string;
  episodeId: string;
  episodeIdentityDigest: string;
  episodeRevisionDigest: string;
  rootSessionIdentityDigest: string;
  occurredAt: string;
  provider: "codex" | "claude";
  routingIdentityKind: "project" | "repository";
  routingIdentityDigest: string;
  completionAuthority: false;
  reopenAuthority: false;
}

export interface TaskMapNativeAgentSessionTaskProofV1 {
  taskId: string;
  candidateId: string;
  candidateRevisionDigest: string;
  evidenceProofDigests: string[];
  promotionId: string;
  promotionDigest: string;
  supportIdentityDigest: string;
  supportEvidenceProofDigest: string;
  episode: TaskMapNativeAgentSessionEpisodeAdmissionV1;
}

export interface TaskMapNativeCurrentnessForWorkV1 {
  contractVersion: "taskmap-native-currentness-gate.v1";
  runId: string;
  inputDigest: string;
  projectionDigest: string;
  taskDispositions: Array<{
    taskId: string;
    disposition: "current" | "needs_lifecycle_review";
  }>;
}

export interface TaskMapNativeCurrentWorkV1 {
  contractVersion: "taskmap-current-work.v1";
  projection: {
    contractVersion: string;
    runId: string;
    inputDigest: string;
    generatedAt: string;
    projectionDigest: string;
  };
  currentGoal: {
    rootId: string;
    title: string;
    accepted: boolean;
  };
  agentSessionTaskProofs?: TaskMapNativeAgentSessionTaskProofV1[];
  nextTaskToProve: {
    taskId: string;
    rootId: string;
    outcome: string;
    input: {
      summary: string;
      contextPointerIds: string[];
      agentSessionEpisode?: TaskMapNativeAgentSessionEpisodeAdmissionV1;
    };
    predecessors: Array<{
      taskId: string;
      relation: "depends_on" | "blocks";
      reviewState: string;
      openState: string;
    }>;
    doneDefinition: string[];
    permission: {
      requiresExplicitApproval: boolean;
      approvalGranted: boolean;
    };
    returnTarget:
      | { state: "source_owned"; pointerId: string }
      | { state: "source_return"; pointerId: string }
      | { state: "personal_fork"; pointerId: string }
      | { state: "user_destination_required" };
    executable: boolean;
  };
  privacy: {
    sourceBodiesStored: boolean;
    localPathsStored: boolean;
    rawBiometricsStored: boolean;
  };
  artifactDigest: string;
}

function fail(): never {
  throw new Error("Task Map native current-work continuity failed");
}

function assertPlainObject(
  value: unknown,
): asserts value is JsonObject {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail();
  }
}

function assertExactKeys(
  value: JsonObject,
  expected: readonly string[],
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])
  ) {
    fail();
  }
}

function assertString(
  value: unknown,
  maximum = MAX_TEXT_CHARACTERS,
): asserts value is string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maximum
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  ) {
    fail();
  }
}

function assertDigest(value: unknown): asserts value is string {
  if (typeof value !== "string" || !SHA256.test(value)) fail();
}

function assertStrictTimestamp(value: unknown): asserts value is string {
  if (
    typeof value !== "string"
    || !STRICT_RFC3339.test(value)
    || !Number.isFinite(Date.parse(value))
  ) {
    fail();
  }
}

export function validateTaskMapNativeAgentSessionEpisodeAdmission(
  value: unknown,
): TaskMapNativeAgentSessionEpisodeAdmissionV1 {
  assertPlainObject(value);
  assertExactKeys(value, [
    "admission",
    "directive",
    "userDirectiveSummary",
    "episodeId",
    "episodeIdentityDigest",
    "episodeRevisionDigest",
    "rootSessionIdentityDigest",
    "occurredAt",
    "provider",
    "routingIdentityKind",
    "routingIdentityDigest",
    "completionAuthority",
    "reopenAuthority",
  ]);
  assertDigest(value.episodeIdentityDigest);
  assertDigest(value.episodeRevisionDigest);
  assertDigest(value.rootSessionIdentityDigest);
  assertDigest(value.routingIdentityDigest);
  assertStrictTimestamp(value.occurredAt);
  assertString(value.userDirectiveSummary, 360);
  if (taskMapProjectionPrivacyLeakReasons(value.userDirectiveSummary).length > 0) {
    fail();
  }
  if (
    value.admission !== "authenticated_fresh_agent_session"
    || value.directive !== "user_directive"
    || value.episodeId
      !== `tmaepisode_${
        taskMapContractDigest(value.episodeIdentityDigest).slice(0, 16)
      }`
    || (value.provider !== "codex" && value.provider !== "claude")
    || (
      value.routingIdentityKind !== "project"
      && value.routingIdentityKind !== "repository"
    )
    || value.completionAuthority !== false
    || value.reopenAuthority !== false
  ) {
    fail();
  }
  return structuredClone(
    value as unknown as TaskMapNativeAgentSessionEpisodeAdmissionV1,
  );
}

export function validateTaskMapNativeAgentSessionTaskProof(
  value: unknown,
): TaskMapNativeAgentSessionTaskProofV1 {
  assertPlainObject(value);
  assertExactKeys(value, [
    "taskId",
    "candidateId",
    "candidateRevisionDigest",
    "evidenceProofDigests",
    "promotionId",
    "promotionDigest",
    "supportIdentityDigest",
    "supportEvidenceProofDigest",
    "episode",
  ]);
  assertString(value.taskId, 256);
  assertString(value.candidateId, 256);
  assertDigest(value.candidateRevisionDigest);
  assertDigest(value.promotionDigest);
  assertDigest(value.supportIdentityDigest);
  assertDigest(value.supportEvidenceProofDigest);
  if (
    !Array.isArray(value.evidenceProofDigests)
    || value.evidenceProofDigests.length === 0
    || value.evidenceProofDigests.length > 128
  ) fail();
  value.evidenceProofDigests.forEach(assertDigest);
  const canonicalProofs = [...value.evidenceProofDigests].sort();
  if (
    new Set(canonicalProofs).size !== canonicalProofs.length
    || !sameCanonical(value.evidenceProofDigests, canonicalProofs)
    || !canonicalProofs.includes(value.supportEvidenceProofDigest as string)
    || value.candidateRevisionDigest !== taskMapNativeCandidateRevisionDigest(
      value.candidateId as string,
      canonicalProofs,
    )
    || value.promotionId
      !== "tmcandidatepromotion_" + (value.promotionDigest as string)
  ) fail();
  const episode = validateTaskMapNativeAgentSessionEpisodeAdmission(
    value.episode,
  );
  return structuredClone({
    ...value,
    episode,
  } as unknown as TaskMapNativeAgentSessionTaskProofV1);
}

function assertStringArray(
  value: unknown,
  maximumLength: number,
  maximumItemLength: number,
): asserts value is string[] {
  if (!Array.isArray(value) || value.length > maximumLength) fail();
  for (const item of value) assertString(item, maximumItemLength);
  if (new Set(value).size !== value.length) fail();
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return taskMapContractCanonicalJson(left)
    === taskMapContractCanonicalJson(right);
}

function expectedContextPointerIds(
  projection: TaskMapProjectionV1,
  task: TaskMapTask,
): string[] {
  const sourceById = new Map(
    projection.sources.map((source) => [source.id, source]),
  );
  return [...new Set([
    ...task.originPointerIds.filter((pointerId) =>
      sourceById.get(pointerId)?.sourceKind !== "oura"
    ),
    ...task.citations
      .filter((citation) => citation.sourceKind !== "oura")
      .map((citation) => citation.pointerId),
  ])].sort();
}

function expectedPredecessors(
  projection: TaskMapProjectionV1,
  taskId: string,
): TaskMapNativeCurrentWorkV1["nextTaskToProve"]["predecessors"] {
  const tasks = new Map(projection.tasks.map((task) => [task.id, task]));
  const predecessors:
    TaskMapNativeCurrentWorkV1["nextTaskToProve"]["predecessors"] = [];
  for (const edge of projection.edges) {
    let predecessorId: string | undefined;
    let relation: "depends_on" | "blocks" | undefined;
    if (edge.relation === "depends_on" && edge.from === taskId) {
      predecessorId = edge.to;
      relation = "depends_on";
    } else if (edge.relation === "blocks" && edge.to === taskId) {
      predecessorId = edge.from;
      relation = "blocks";
    }
    if (predecessorId === undefined || relation === undefined) continue;
    const task = tasks.get(predecessorId);
    if (task === undefined) fail();
    predecessors.push({
      taskId: task.id,
      relation,
      reviewState: task.reviewState,
      openState: task.openState,
    });
  }
  return predecessors.sort((left, right) =>
    left.taskId.localeCompare(right.taskId)
    || left.relation.localeCompare(right.relation)
  );
}

function currentSourceBacks(
  projection: TaskMapProjectionV1,
  task: TaskMapTask,
): boolean {
  const homeId = task.taskHomePointerId;
  if (
    task.reviewState !== "accepted"
    || task.openState !== "open"
    || (task.sourceStatus !== "open" && task.sourceStatus !== "in_progress")
    || task.authority === "none"
    || homeId === undefined
    || !task.originPointerIds.includes(homeId)
  ) {
    return false;
  }
  const source = projection.sources.find((row) => row.id === homeId);
  return (
    source !== undefined
    && source.authority === task.authority
    && source.sourceKind !== "oura"
    && source.sourceKind !== "codex_session"
    && source.sourceKind !== "claude_session"
    && source.capabilities.includes("read_task")
    && typeof source.sourceVersion === "string"
    && source.sourceVersion.trim().length > 0
    && task.citations.some((citation) =>
      citation.pointerId === homeId
      && citation.sourceKind === source.sourceKind
    )
  );
}

function assertCurrentness(
  projection: TaskMapProjectionV1,
  currentness: TaskMapNativeCurrentnessForWorkV1,
): void {
  if (
    currentness.contractVersion !== "taskmap-native-currentness-gate.v1"
    || currentness.runId !== projection.runId
    || currentness.inputDigest !== projection.inputDigest
    || currentness.projectionDigest
      !== diffTaskMapProjections(null, projection).currentProjectionDigest
    || currentness.taskDispositions.length !== projection.tasks.length
  ) {
    fail();
  }
  const dispositions = new Map(
    currentness.taskDispositions.map((row) => [
      row.taskId,
      row.disposition,
    ]),
  );
  if (
    dispositions.size !== projection.tasks.length
    || projection.tasks.some((task) => !dispositions.has(task.id))
  ) {
    fail();
  }
}

export function validateTaskMapNativeCurrentWork(
  value: unknown,
  rawBytes: Buffer,
  projection: TaskMapProjectionV1,
  currentness: TaskMapNativeCurrentnessForWorkV1,
): TaskMapNativeCurrentWorkV1 {
  assertPlainObject(value);
  assertExactKeys(value, [
    "contractVersion",
    "projection",
    "currentGoal",
    ...(Object.prototype.hasOwnProperty.call(
      value,
      "agentSessionTaskProofs",
    ) ? ["agentSessionTaskProofs"] : []),
    "nextTaskToProve",
    "privacy",
    "artifactDigest",
  ]);
  if (
    value.contractVersion !== "taskmap-current-work.v1"
    || taskMapContractCanonicalJson(value) !== rawBytes.toString("utf8")
  ) {
    fail();
  }
  assertDigest(value.artifactDigest);
  const digestCore = { ...value };
  delete digestCore.artifactDigest;
  if (taskMapContractDigest(digestCore) !== value.artifactDigest) fail();

  assertPlainObject(value.projection);
  assertExactKeys(value.projection, [
    "contractVersion",
    "runId",
    "inputDigest",
    "generatedAt",
    "projectionDigest",
  ]);
  assertString(value.projection.contractVersion, 128);
  assertString(value.projection.runId, 256);
  assertDigest(value.projection.inputDigest);
  assertStrictTimestamp(value.projection.generatedAt);
  assertDigest(value.projection.projectionDigest);

  assertPlainObject(value.currentGoal);
  assertExactKeys(value.currentGoal, ["rootId", "title", "accepted"]);
  assertString(value.currentGoal.rootId, 256);
  assertString(value.currentGoal.title);
  if (value.currentGoal.accepted !== true) fail();

  if (Object.prototype.hasOwnProperty.call(value, "agentSessionTaskProofs")) {
    if (
      !Array.isArray(value.agentSessionTaskProofs)
      || value.agentSessionTaskProofs.length > 128
    ) fail();
    const rows = value.agentSessionTaskProofs.map(
      validateTaskMapNativeAgentSessionTaskProof,
    );
    const taskIds = rows.map((row) => row.taskId);
    if (
      new Set(taskIds).size !== taskIds.length
      || !sameCanonical(taskIds, [...taskIds].sort())
      || taskIds.some((taskId) =>
        !projection.tasks.some((task) => task.id === taskId)
      )
    ) fail();
  }

  assertPlainObject(value.nextTaskToProve);
  assertExactKeys(value.nextTaskToProve, [
    "taskId",
    "rootId",
    "outcome",
    "input",
    "predecessors",
    "doneDefinition",
    "permission",
    "returnTarget",
    "executable",
  ]);
  assertString(value.nextTaskToProve.taskId, 256);
  assertString(value.nextTaskToProve.rootId, 256);
  assertString(value.nextTaskToProve.outcome, 320);
  assertPlainObject(value.nextTaskToProve.input);
  const inputKeys = [
    "summary",
    "contextPointerIds",
    ...(
      Object.prototype.hasOwnProperty.call(
        value.nextTaskToProve.input,
        "agentSessionEpisode",
      )
        ? ["agentSessionEpisode"]
        : []
    ),
  ];
  assertExactKeys(value.nextTaskToProve.input, inputKeys);
  assertString(value.nextTaskToProve.input.summary, 320);
  assertStringArray(
    value.nextTaskToProve.input.contextPointerIds,
    MAX_CONTEXT_POINTERS,
    512,
  );
  if (
    Object.prototype.hasOwnProperty.call(
      value.nextTaskToProve.input,
      "agentSessionEpisode",
    )
  ) {
    validateTaskMapNativeAgentSessionEpisodeAdmission(
      value.nextTaskToProve.input.agentSessionEpisode,
    );
  }
  assertStringArray(
    value.nextTaskToProve.doneDefinition,
    MAX_DONE_ITEMS,
    240,
  );
  if (value.nextTaskToProve.doneDefinition.length === 0) fail();
  if (
    !Array.isArray(value.nextTaskToProve.predecessors)
    || value.nextTaskToProve.predecessors.length > 256
  ) {
    fail();
  }
  for (const predecessor of value.nextTaskToProve.predecessors) {
    assertPlainObject(predecessor);
    assertExactKeys(predecessor, [
      "taskId",
      "relation",
      "reviewState",
      "openState",
    ]);
    assertString(predecessor.taskId, 256);
    if (
      predecessor.relation !== "depends_on"
      && predecessor.relation !== "blocks"
    ) {
      fail();
    }
    assertString(predecessor.reviewState, 64);
    assertString(predecessor.openState, 64);
  }
  assertPlainObject(value.nextTaskToProve.permission);
  assertExactKeys(value.nextTaskToProve.permission, [
    "requiresExplicitApproval",
    "approvalGranted",
  ]);
  if (
    value.nextTaskToProve.permission.requiresExplicitApproval !== true
    || value.nextTaskToProve.permission.approvalGranted !== false
    || value.nextTaskToProve.executable !== false
  ) {
    fail();
  }
  assertPlainObject(value.nextTaskToProve.returnTarget);
  const target = value.nextTaskToProve.returnTarget;
  if (target.state === "user_destination_required") {
    assertExactKeys(target, ["state"]);
  } else if (
    target.state === "source_owned"
    || target.state === "source_return"
    || target.state === "personal_fork"
  ) {
    assertExactKeys(target, ["state", "pointerId"]);
    assertString(target.pointerId, 512);
  } else {
    fail();
  }

  assertPlainObject(value.privacy);
  assertExactKeys(value.privacy, [
    "sourceBodiesStored",
    "localPathsStored",
    "rawBiometricsStored",
  ]);
  if (
    value.privacy.sourceBodiesStored !== false
    || value.privacy.localPathsStored !== false
    || value.privacy.rawBiometricsStored !== false
  ) {
    fail();
  }

  assertCurrentness(projection, currentness);
  if (
    projection.runStatus !== "accepted"
    || projection.rejections.length !== 0
    || value.projection.contractVersion !== projection.contractVersion
    || value.projection.runId !== projection.runId
    || value.projection.inputDigest !== projection.inputDigest
    || value.projection.generatedAt !== projection.generatedAt
    || value.projection.projectionDigest !== currentness.projectionDigest
  ) {
    fail();
  }

  const currentWork = value as unknown as TaskMapNativeCurrentWorkV1;
  const leaf = currentWork.nextTaskToProve;
  if (
    !TASK_ID.test(leaf.taskId)
    || !ROOT_ID.test(leaf.rootId)
    || !ROOT_ID.test(currentWork.currentGoal.rootId)
    || currentWork.currentGoal.rootId !== leaf.rootId
  ) {
    fail();
  }
  const root = projection.roots.find((row) => row.id === leaf.rootId);
  const task = projection.tasks.find((row) => row.id === leaf.taskId);
  const disposition = currentness.taskDispositions.find(
    (row) => row.taskId === leaf.taskId,
  )?.disposition;
  if (
    root === undefined
    || task === undefined
    || disposition !== "current"
    || task.rootId !== root.id
    || !root.taskIds.includes(task.id)
    || !currentSourceBacks(projection, task)
    || task.citations.every((citation) => citation.sourceKind === "oura")
  ) {
    fail();
  }

  if (
    leaf.returnTarget.state === "user_destination_required"
    || !projection.sources.some((source) =>
      "pointerId" in leaf.returnTarget
      && source.id === leaf.returnTarget.pointerId
    )
  ) {
    fail();
  }
  const expectedReturnTarget =
    task.returnRoute.state === "user_destination_required"
      ? { state: task.returnRoute.state }
      : {
          state: task.returnRoute.state,
          pointerId: task.returnRoute.pointerId,
        };
  if (
    task.returnRoute.requiresApproval !== true
    || !sameCanonical(leaf.returnTarget, expectedReturnTarget)
    || !sameCanonical(
      leaf.input.contextPointerIds,
      expectedContextPointerIds(projection, task),
    )
    || !sameCanonical(
      leaf.predecessors,
      expectedPredecessors(projection, task.id),
    )
    || taskMapProjectionPrivacyLeakReasons(leaf).length > 0
  ) {
    fail();
  }
  return currentWork;
}

export function buildTaskMapNativeCurrentWorkSuccessor(
  predecessorValue: unknown,
  predecessorBytes: Buffer,
  predecessorProjection: TaskMapProjectionV1,
  predecessorCurrentness: TaskMapNativeCurrentnessForWorkV1,
  successorProjection: TaskMapProjectionV1,
  successorCurrentness: TaskMapNativeCurrentnessForWorkV1,
  agentSessionEpisode:
    TaskMapNativeAgentSessionEpisodeAdmissionV1 | null = null,
  agentSessionTaskProofs?: readonly TaskMapNativeAgentSessionTaskProofV1[],
): TaskMapNativeCurrentWorkV1 {
  const predecessor = validateTaskMapNativeCurrentWork(
    predecessorValue,
    predecessorBytes,
    predecessorProjection,
    predecessorCurrentness,
  );
  const {
    artifactDigest: _predecessorArtifactDigest,
    ...predecessorCore
  } = structuredClone(predecessor);
  const successorCore = {
    ...predecessorCore,
    projection: {
      contractVersion: successorProjection.contractVersion,
      runId: successorProjection.runId,
      inputDigest: successorProjection.inputDigest,
      generatedAt: successorProjection.generatedAt,
      projectionDigest: successorCurrentness.projectionDigest,
    },
    nextTaskToProve: {
      ...predecessorCore.nextTaskToProve,
      input: {
        summary: predecessorCore.nextTaskToProve.input.summary,
        contextPointerIds: [
          ...predecessorCore.nextTaskToProve.input.contextPointerIds,
        ],
        ...(agentSessionEpisode === null
          ? {}
          : {
              agentSessionEpisode: structuredClone(agentSessionEpisode),
            }),
      },
    },
  };
  if (agentSessionTaskProofs !== undefined) {
    successorCore.agentSessionTaskProofs = agentSessionTaskProofs
      .map((row) => validateTaskMapNativeAgentSessionTaskProof(row))
      .sort((left, right) => left.taskId.localeCompare(right.taskId));
  }
  const successor: TaskMapNativeCurrentWorkV1 = {
    ...successorCore,
    artifactDigest: taskMapContractDigest(successorCore),
  };
  return validateTaskMapNativeCurrentWork(
    successor,
    Buffer.from(taskMapContractCanonicalJson(successor), "utf8"),
    successorProjection,
    successorCurrentness,
  );
}
