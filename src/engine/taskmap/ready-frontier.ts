import { taskMapProjectionPrivacyLeakReasons } from "./harness.js";
import {
  taskMapExecutableNowChecks,
  type TaskMapExecutableNowCheckV1,
} from "./executable-now-checks.js";
import type {
  TaskMapNativeCurrentnessForWorkV1,
  TaskMapNativeCurrentWorkV1,
} from "./native-current-work-successor.js";
import {
  diffTaskMapProjections,
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";
import { isTaskMapMentionDisplayTextSafe } from "./mention-extraction.js";
import type {
  CausalGrade,
  TaskMapProjectionV1,
  TaskMapTask,
} from "./types.js";

export const TASKMAP_READY_FRONTIER_VERSION =
  "taskmap-ready-frontier.v1" as const;
export const TASKMAP_READY_FRONTIER_POLICY_VERSION =
  "taskmap-ready-frontier-policy.1" as const;
export const TASKMAP_READY_PROOF_TARGETS_VERSION =
  "taskmap-ready-proof-targets.v1" as const;

export const TASKMAP_READY_FRONTIER_LIMITS_V1 = Object.freeze({
  maxTasks: 4_096,
  maxProofTargets: 32,
  // The completion CLI can also carry 256 sealed history rows and repeats
  // terminal ids in the union plus its disjoint disposition arrays. Keeping
  // proof-target evidence at 32 KiB leaves bounded room inside its 256 KiB
  // Node/Swift response envelope.
  maxProofTargetsArtifactBytes: 32 * 1_024,
  maxContextPointers: 128,
  maxPredecessors: 256,
  maxDoneItems: 12,
  maxOutcomeCharacters: 320,
  maxInputSummaryCharacters: 320,
  maxDoneItemCharacters: 240,
  maxPointerIdCharacters: 512,
});

const SHA256 = /^[a-f0-9]{64}$/;
const ATOMIC_TASK_ID = /^tmt_[A-Za-z0-9._-]{1,256}$/;
const STRICT_RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const DAY_MS = 24 * 60 * 60 * 1_000;

type ProofTarget = TaskMapNativeCurrentWorkV1["nextTaskToProve"];

export interface TaskMapReadyFrontierApprovalPackageBoundaryV1 {
  contractVersion: "taskmap-local-approval-inspection.v1";
  readyForLocalApproval: true;
  currentWorkApprovalGranted: false;
  currentWorkExecutable: false;
  authorizationScope: "prepare_local_package_only";
  dispatchAuthorized: false;
  sourceWritebackAuthorized: false;
  codexTaskStartAuthorized: false;
  sourceCompletionAuthorized: false;
  outcomeVerificationAuthorized: false;
}

export type TaskMapReadyFrontierProofTargetV1 = ProofTarget & {
  approvalPackage: TaskMapReadyFrontierApprovalPackageBoundaryV1;
};

export interface TaskMapReadyFrontierCurrentnessBindingV1 {
  contractVersion: "taskmap-native-currentness-gate.v1";
  runId: string;
  inputDigest: string;
  projectionDigest: string;
  taskDispositionsDigest: string;
}

export interface TaskMapReadyProofTargetsV1 {
  contractVersion: typeof TASKMAP_READY_PROOF_TARGETS_VERSION;
  projection: {
    contractVersion: string;
    runId: string;
    inputDigest: string;
    generatedAt: string;
    projectionDigest: string;
  };
  currentness: TaskMapReadyFrontierCurrentnessBindingV1;
  proofTargets: TaskMapReadyFrontierProofTargetV1[];
  artifactDigest: string;
}

export interface TaskMapReadyFrontierTerminalOverlayBindingV1 {
  contractVersion: "taskmap-local-completion-overlay.v1";
  artifactDigest: string;
  localOwnerScopeDigest: string;
  terminalTaskIds: string[];
}

export interface TaskMapReadyFrontierExactDeadlineV1 {
  taskId: string;
  deadlineAt: string | null;
}

export interface TaskMapReadyFrontierCausalGradeV1 {
  rootId: string;
  causalGrade: CausalGrade;
}

export interface TaskMapReadyFrontierInputV1 {
  projection: TaskMapProjectionV1;
  currentness: TaskMapNativeCurrentnessForWorkV1;
  evaluatedAt: string;
  terminalOverlay: TaskMapReadyFrontierTerminalOverlayBindingV1;
  exactDeadlineSourceDigest: string;
  exactDeadlineBindingDigest: string;
  exactDeadlines: TaskMapReadyFrontierExactDeadlineV1[];
  causalGradeSourceDigest: string;
  causalGradeBindingDigest: string;
  causalGrades: TaskMapReadyFrontierCausalGradeV1[];
  proofTargets: TaskMapReadyFrontierProofTargetV1[];
}

export interface ValidateTaskMapReadyFrontierInputV1 {
  projection: TaskMapProjectionV1;
  currentness: TaskMapNativeCurrentnessForWorkV1;
  terminalOverlay: TaskMapReadyFrontierTerminalOverlayBindingV1;
  proofTargets: TaskMapReadyFrontierProofTargetV1[];
}

export type TaskMapReadyFrontierBlockerCode =
  | "projection_not_accepted"
  | "terminal_task"
  | "not_atomic_task"
  | "invalid_root_membership"
  | "not_accepted"
  | "not_open"
  | "not_current"
  | "source_contract_incomplete"
  | "proof_target_missing"
  | "proof_target_binding_invalid"
  | "input_contract_incomplete"
  | "done_contract_incomplete"
  | "permission_contract_invalid"
  | "return_route_incomplete"
  | "predecessor_contract_mismatch"
  | "dependency_unresolved"
  | "approval_package_contract_invalid"
  | "privacy_boundary_invalid";

export interface TaskMapReadyFrontierBlockerV1 {
  code: TaskMapReadyFrontierBlockerCode;
  relatedTaskId?: string;
}

export type TaskMapReadyFrontierDeadlineTier = 0 | 1 | 2 | 3 | 4;
export type TaskMapReadyFrontierDeadlineTierLabel =
  | "overdue"
  | "within_24_hours"
  | "within_3_days"
  | "within_7_days"
  | "later"
  | "none";

export interface TaskMapReadyFrontierRankInputsV1 {
  deadlineTier: TaskMapReadyFrontierDeadlineTier;
  deadlineTierLabel: TaskMapReadyFrontierDeadlineTierLabel;
  newlyUnblockedCount: number;
  boundCausalGrade: CausalGrade | null;
  currentCausalTier: 0 | 2 | 3 | 4;
  deadlineAt: string | null;
  stableTaskId: string;
}

export interface TaskMapReadyFrontierEvaluationV1 {
  taskId: string;
  rootId: string;
  readiness: "ready" | "blocked";
  blockers: TaskMapReadyFrontierBlockerV1[];
  checks: TaskMapExecutableNowCheckV1[];
  rankInputs: TaskMapReadyFrontierRankInputsV1;
}

export interface TaskMapReadyFrontierLeafV1 {
  taskId: string;
  rootId: string;
  rank: number;
  readiness: "ready_for_owner_approval";
  approvalGranted: false;
  executable: false;
  rankInputs: TaskMapReadyFrontierRankInputsV1;
  proofTarget: TaskMapReadyFrontierProofTargetV1;
}

export interface TaskMapReadyFrontierV1 {
  contractVersion: typeof TASKMAP_READY_FRONTIER_VERSION;
  policyVersion: typeof TASKMAP_READY_FRONTIER_POLICY_VERSION;
  evaluatedAt: string;
  projection: {
    contractVersion: string;
    runId: string;
    inputDigest: string;
    generatedAt: string;
    projectionDigest: string;
  };
  currentness: TaskMapReadyFrontierCurrentnessBindingV1;
  terminalOverlay: TaskMapReadyFrontierTerminalOverlayBindingV1;
  exactDeadlineSourceDigest: string;
  exactDeadlineBindingDigest: string;
  causalGradeSourceDigest: string;
  causalGradeBindingDigest: string;
  evaluations: TaskMapReadyFrontierEvaluationV1[];
  readyLeaves: TaskMapReadyFrontierLeafV1[];
  authorityBoundary: {
    membershipCreated: false;
    readinessCreatedByCausalData: false;
    approvalGranted: false;
    executionStarted: false;
    completionGranted: false;
  };
  privacy: {
    sourceBodiesStored: false;
    localPathsStored: false;
    rawBiometricsStored: false;
  };
  artifactDigest: string;
}

interface PreparedInput {
  projectionDigest: string;
  dispositions: ReadonlyMap<string, "current" | "needs_lifecycle_review">;
  terminalTaskIds: ReadonlySet<string>;
  deadlines: ReadonlyMap<string, string | null>;
  causalGrades: ReadonlyMap<string, CausalGrade>;
  proofTargets: ReadonlyMap<string, TaskMapReadyFrontierProofTargetV1>;
  taskById: ReadonlyMap<string, TaskMapTask>;
  unresolvedPredecessors: ReadonlyMap<string, readonly string[]>;
  newlyUnblockedCount: ReadonlyMap<string, number>;
  evaluatedAtMs: number;
}

function fail(message: string): never {
  throw new TypeError(`Task Map ready frontier: ${message}`);
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validDigest(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function timestampMs(value: unknown): number | null {
  if (
    typeof value !== "string"
    || !STRICT_RFC3339.test(value)
  ) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validBoundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && !CONTROL_CHARACTERS.test(value);
}

function validBoundedDisplayText(
  value: unknown,
  maximum: number,
): value is string {
  return typeof value === "string"
    && value.length <= maximum
    && isTaskMapMentionDisplayTextSafe(value);
}

function proofTargetDisplayTextValid(
  target: TaskMapReadyFrontierProofTargetV1,
): boolean {
  return validBoundedDisplayText(
    target.outcome,
    TASKMAP_READY_FRONTIER_LIMITS_V1.maxOutcomeCharacters,
  )
    && validBoundedDisplayText(
      target.input?.summary,
      TASKMAP_READY_FRONTIER_LIMITS_V1.maxInputSummaryCharacters,
    )
    && Array.isArray(target.doneDefinition)
    && target.doneDefinition.every((item) =>
      validBoundedDisplayText(
        item,
        TASKMAP_READY_FRONTIER_LIMITS_V1.maxDoneItemCharacters,
      )
    );
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return taskMapContractCanonicalJson(left)
    === taskMapContractCanonicalJson(right);
}

export function taskMapReadyFrontierCurrentnessBindingDigest(
  currentness: TaskMapNativeCurrentnessForWorkV1,
): string {
  if (
    currentness.contractVersion !== "taskmap-native-currentness-gate.v1"
    || typeof currentness.runId !== "string"
    || currentness.runId.length === 0
    || !validDigest(currentness.inputDigest)
    || !validDigest(currentness.projectionDigest)
    || !Array.isArray(currentness.taskDispositions)
    || currentness.taskDispositions.length
      > TASKMAP_READY_FRONTIER_LIMITS_V1.maxTasks
  ) {
    fail("currentness binding is invalid");
  }
  const taskDispositions = structuredClone(
    currentness.taskDispositions,
  ).sort((left, right) => stableCompare(left.taskId, right.taskId));
  if (
    new Set(taskDispositions.map((row) => row.taskId)).size
      !== taskDispositions.length
    || taskDispositions.some((row) =>
      typeof row.taskId !== "string"
      || row.taskId.length === 0
      || (
        row.disposition !== "current"
        && row.disposition !== "needs_lifecycle_review"
      )
    )
  ) {
    fail("currentness task dispositions are invalid");
  }
  return taskMapContractDigest({
    domain: "taskmap-ready-frontier-currentness-binding.1",
    contractVersion: currentness.contractVersion,
    runId: currentness.runId,
    inputDigest: currentness.inputDigest,
    projectionDigest: currentness.projectionDigest,
    taskDispositions,
  });
}

function currentnessBinding(
  currentness: TaskMapNativeCurrentnessForWorkV1,
): TaskMapReadyFrontierCurrentnessBindingV1 {
  return {
    contractVersion: currentness.contractVersion,
    runId: currentness.runId,
    inputDigest: currentness.inputDigest,
    projectionDigest: currentness.projectionDigest,
    taskDispositionsDigest:
      taskMapReadyFrontierCurrentnessBindingDigest(currentness),
  };
}

function evidenceProjectionBinding(
  projection: TaskMapProjectionV1,
  currentness: TaskMapNativeCurrentnessForWorkV1,
) {
  return {
    projection: {
      contractVersion: projection.contractVersion,
      runId: projection.runId,
      inputDigest: projection.inputDigest,
      generatedAt: projection.generatedAt,
      projectionDigest: currentness.projectionDigest,
    },
    currentness: currentnessBinding(currentness),
  };
}

export function taskMapReadyFrontierDeadlineBindingDigest(input: {
  projection: TaskMapProjectionV1;
  currentness: TaskMapNativeCurrentnessForWorkV1;
  sourceDigest: string;
  rows: TaskMapReadyFrontierExactDeadlineV1[];
}): string {
  if (!validDigest(input.sourceDigest)) {
    fail("exact-deadline source digest is invalid");
  }
  const rows = [...input.rows].sort((left, right) =>
    stableCompare(left.taskId, right.taskId)
  );
  return taskMapContractDigest({
    domain: "taskmap-ready-frontier-deadline-binding.1",
    ...evidenceProjectionBinding(input.projection, input.currentness),
    sourceDigest: input.sourceDigest,
    rows,
  });
}

export function taskMapReadyFrontierCausalGradeBindingDigest(input: {
  projection: TaskMapProjectionV1;
  currentness: TaskMapNativeCurrentnessForWorkV1;
  sourceDigest: string;
  rows: TaskMapReadyFrontierCausalGradeV1[];
}): string {
  if (!validDigest(input.sourceDigest)) {
    fail("causal-grade source digest is invalid");
  }
  const rows = [...input.rows].sort((left, right) =>
    stableCompare(left.rootId, right.rootId)
  );
  return taskMapContractDigest({
    domain: "taskmap-ready-frontier-causal-grade-binding.1",
    ...evidenceProjectionBinding(input.projection, input.currentness),
    sourceDigest: input.sourceDigest,
    rows,
  });
}

export function buildTaskMapReadyProofTargets(input: {
  projection: TaskMapProjectionV1;
  currentness: TaskMapNativeCurrentnessForWorkV1;
  proofTargets: TaskMapReadyFrontierProofTargetV1[];
}): TaskMapReadyProofTargetsV1 {
  if (
    input.proofTargets.length
      > TASKMAP_READY_FRONTIER_LIMITS_V1.maxProofTargets
  ) {
    fail("proof-target count exceeds the bounded collection ceiling");
  }
  const projectionDigest =
    diffTaskMapProjections(null, input.projection).currentProjectionDigest;
  if (
    input.currentness.runId !== input.projection.runId
    || input.currentness.inputDigest !== input.projection.inputDigest
    || input.currentness.projectionDigest !== projectionDigest
  ) {
    fail("proof-target collection is not projection-bound");
  }
  const proofTargets = structuredClone(input.proofTargets).sort(
    (left, right) => stableCompare(left.taskId, right.taskId),
  );
  if (new Set(proofTargets.map((row) => row.taskId)).size !== proofTargets.length) {
    fail("proof-target collection repeats a task ID");
  }
  if (proofTargets.some((target) => !proofTargetDisplayTextValid(target))) {
    fail("proof-target display text is invalid");
  }
  const base = {
    contractVersion: TASKMAP_READY_PROOF_TARGETS_VERSION,
    ...evidenceProjectionBinding(input.projection, input.currentness),
    proofTargets,
  };
  const result = {
    ...base,
    artifactDigest: taskMapContractDigest({
      domain: "taskmap-ready-proof-targets.1",
      ...base,
    }),
  };
  if (
    Buffer.byteLength(taskMapContractCanonicalJson(result), "utf8")
      > TASKMAP_READY_FRONTIER_LIMITS_V1.maxProofTargetsArtifactBytes
  ) {
    fail("proof-target collection exceeds the response-safe byte ceiling");
  }
  return result;
}

export function validateTaskMapReadyProofTargets(
  value: unknown,
  projection: TaskMapProjectionV1,
  currentness: TaskMapNativeCurrentnessForWorkV1,
): TaskMapReadyProofTargetsV1 {
  if (!plainObject(value)) fail("proof-target collection is not an object");
  const expectedKeys = [
    "contractVersion",
    "projection",
    "currentness",
    "proofTargets",
    "artifactDigest",
  ].sort();
  if (!sameCanonical(Object.keys(value).sort(), expectedKeys)) {
    fail("proof-target collection keys are invalid");
  }
  if (
    value.contractVersion !== TASKMAP_READY_PROOF_TARGETS_VERSION
    || !Array.isArray(value.proofTargets)
    || !validDigest(value.artifactDigest)
  ) {
    fail("proof-target collection boundary is invalid");
  }
  const rebuilt = buildTaskMapReadyProofTargets({
    projection,
    currentness,
    proofTargets: value.proofTargets as TaskMapReadyFrontierProofTargetV1[],
  });
  if (!sameCanonical(rebuilt, value)) {
    fail("proof-target collection seal or binding is invalid");
  }
  return rebuilt;
}

function terminalByProjection(task: TaskMapTask | undefined): boolean {
  return task !== undefined
    && (
      task.reviewState === "source_complete"
      || task.reviewState === "superseded"
      || task.openState === "completed"
      || task.openState === "superseded"
    );
}

function operationalPredecessorIds(
  projection: TaskMapProjectionV1,
  taskId: string,
): string[] {
  const predecessors = new Set<string>();
  for (const edge of projection.edges) {
    if (edge.relation === "depends_on" && edge.from === taskId) {
      predecessors.add(edge.to);
    } else if (edge.relation === "blocks" && edge.to === taskId) {
      predecessors.add(edge.from);
    }
  }
  return [...predecessors].sort(stableCompare);
}

function expectedPredecessors(
  projection: TaskMapProjectionV1,
  taskById: ReadonlyMap<string, TaskMapTask>,
  taskId: string,
): ProofTarget["predecessors"] | null {
  const rows: ProofTarget["predecessors"] = [];
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
    const predecessor = taskById.get(predecessorId);
    if (predecessor === undefined) return null;
    rows.push({
      taskId: predecessor.id,
      relation,
      reviewState: predecessor.reviewState,
      openState: predecessor.openState,
    });
  }
  return rows.sort((left, right) =>
    stableCompare(left.taskId, right.taskId)
    || stableCompare(left.relation, right.relation)
  );
}

function expectedContextPointerIds(
  projection: TaskMapProjectionV1,
  task: TaskMapTask,
): string[] {
  const sourceKindById = new Map(
    projection.sources.map((source) => [source.id, source.sourceKind]),
  );
  return [...new Set([
    ...task.originPointerIds.filter(
      (pointerId) => sourceKindById.get(pointerId) !== "oura",
    ),
    ...task.citations
      .filter((citation) => citation.sourceKind !== "oura")
      .map((citation) => citation.pointerId),
  ])].sort(stableCompare);
}

function sourceContractComplete(
  projection: TaskMapProjectionV1,
  task: TaskMapTask,
): boolean {
  const homeId = task.taskHomePointerId;
  if (
    (task.sourceStatus !== "open" && task.sourceStatus !== "in_progress")
    || task.authority === "none"
    || homeId === undefined
    || !task.originPointerIds.includes(homeId)
  ) {
    return false;
  }
  const source = projection.sources.find((row) => row.id === homeId);
  return source !== undefined
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
    );
}

function inputContractComplete(
  projection: TaskMapProjectionV1,
  task: TaskMapTask,
  target: TaskMapReadyFrontierProofTargetV1,
): boolean {
  if (
    !validBoundedDisplayText(
      target.outcome,
      TASKMAP_READY_FRONTIER_LIMITS_V1.maxOutcomeCharacters,
    )
    || !validBoundedDisplayText(
      target.input?.summary,
      TASKMAP_READY_FRONTIER_LIMITS_V1.maxInputSummaryCharacters,
    )
    || !Array.isArray(target.input?.contextPointerIds)
    || target.input.contextPointerIds.length === 0
    || target.input.contextPointerIds.length
      > TASKMAP_READY_FRONTIER_LIMITS_V1.maxContextPointers
    || new Set(target.input.contextPointerIds).size
      !== target.input.contextPointerIds.length
    || target.input.contextPointerIds.some((pointerId) =>
      !validBoundedText(
        pointerId,
        TASKMAP_READY_FRONTIER_LIMITS_V1.maxPointerIdCharacters,
      )
    )
  ) {
    return false;
  }
  return sameCanonical(
    target.input.contextPointerIds,
    expectedContextPointerIds(projection, task),
  );
}

function doneContractComplete(
  target: TaskMapReadyFrontierProofTargetV1,
): boolean {
  return Array.isArray(target.doneDefinition)
    && target.doneDefinition.length > 0
    && target.doneDefinition.length
      <= TASKMAP_READY_FRONTIER_LIMITS_V1.maxDoneItems
    && target.doneDefinition.every((item) =>
      validBoundedDisplayText(
        item,
        TASKMAP_READY_FRONTIER_LIMITS_V1.maxDoneItemCharacters,
      )
    );
}

function permissionContractValid(
  target: TaskMapReadyFrontierProofTargetV1,
): boolean {
  return target.permission?.requiresExplicitApproval === true
    && target.permission.approvalGranted === false
    && target.executable === false;
}

function expectedReturnTarget(task: TaskMapTask): ProofTarget["returnTarget"] {
  return task.returnRoute.state === "user_destination_required"
    ? { state: "user_destination_required" }
    : {
        state: task.returnRoute.state,
        pointerId: task.returnRoute.pointerId,
      };
}

function returnRouteComplete(
  projection: TaskMapProjectionV1,
  task: TaskMapTask,
  target: TaskMapReadyFrontierProofTargetV1,
): boolean {
  const returnTarget: unknown = target.returnTarget;
  if (
    task.returnRoute.requiresApproval !== true
    || !plainObject(returnTarget)
    || returnTarget.state === "user_destination_required"
    || !sameCanonical(returnTarget, expectedReturnTarget(task))
    || typeof returnTarget.pointerId !== "string"
  ) {
    return false;
  }
  return projection.sources.some(
    (source) => source.id === returnTarget.pointerId,
  );
}

const APPROVAL_PACKAGE_BOUNDARY: TaskMapReadyFrontierApprovalPackageBoundaryV1 = {
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

function structurallyEligibleProofTask(input: {
  projection: TaskMapProjectionV1;
  dispositions: ReadonlyMap<
    string,
    "current" | "needs_lifecycle_review"
  >;
  taskById: ReadonlyMap<string, TaskMapTask>;
  task: TaskMapTask;
}): boolean {
  const { projection, dispositions, taskById, task } = input;
  const root = projection.roots.find((row) => row.id === task.rootId);
  const contextPointerIds = expectedContextPointerIds(projection, task);
  const predecessors = expectedPredecessors(
    projection,
    taskById,
    task.id,
  );
  const returnTarget = expectedReturnTarget(task);
  return projection.runStatus === "accepted"
    && projection.rejections.length === 0
    && ATOMIC_TASK_ID.test(task.id)
    && root !== undefined
    && root.taskIds.includes(task.id)
    && task.reviewState === "accepted"
    && task.openState === "open"
    && dispositions.get(task.id) === "current"
    && sourceContractComplete(projection, task)
    && task.returnRoute.requiresApproval === true
    && returnTarget.state !== "user_destination_required"
    && projection.sources.some((source) =>
      source.id === returnTarget.pointerId
    )
    && validBoundedDisplayText(
      task.title,
      TASKMAP_READY_FRONTIER_LIMITS_V1.maxOutcomeCharacters,
    )
    && validBoundedDisplayText(
      task.title,
      TASKMAP_READY_FRONTIER_LIMITS_V1.maxDoneItemCharacters,
    )
    && validBoundedDisplayText(
      task.summary,
      TASKMAP_READY_FRONTIER_LIMITS_V1.maxInputSummaryCharacters,
    )
    && contextPointerIds.length > 0
    && contextPointerIds.length
      <= TASKMAP_READY_FRONTIER_LIMITS_V1.maxContextPointers
    && contextPointerIds.every((pointerId) =>
      validBoundedText(
        pointerId,
        TASKMAP_READY_FRONTIER_LIMITS_V1.maxPointerIdCharacters,
      )
    )
    && predecessors !== null
    && predecessors.length
      <= TASKMAP_READY_FRONTIER_LIMITS_V1.maxPredecessors
    && taskMapProjectionPrivacyLeakReasons({
      taskId: task.id,
      rootId: task.rootId,
      outcome: task.title,
      input: {
        summary: task.summary,
        contextPointerIds,
      },
      predecessors,
      doneDefinition: [task.title],
      returnTarget,
    }).length === 0;
}

function projectionBoundProofTargetValid(
  projection: TaskMapProjectionV1,
  task: TaskMapTask,
  target: TaskMapReadyFrontierProofTargetV1,
): boolean {
  const root = projection.roots.find((row) => row.id === task.rootId);
  const taskById = new Map(projection.tasks.map((row) => [row.id, row]));
  const predecessors = expectedPredecessors(projection, taskById, task.id);
  return target.taskId === task.id
    && target.rootId === task.rootId
    && root !== undefined
    && root.taskIds.includes(task.id)
    && sourceContractComplete(projection, task)
    && inputContractComplete(projection, task, target)
    && doneContractComplete(target)
    && permissionContractValid(target)
    && returnRouteComplete(projection, task, target)
    && predecessors !== null
    && Array.isArray(target.predecessors)
    && target.predecessors.length
      <= TASKMAP_READY_FRONTIER_LIMITS_V1.maxPredecessors
    && sameCanonical(target.predecessors, predecessors)
    && sameCanonical(target.approvalPackage, APPROVAL_PACKAGE_BOUNDARY)
    && taskMapProjectionPrivacyLeakReasons(target).length === 0;
}

/**
 * Fill projection-bound proof evidence without turning derivation into ranking
 * or execution authority. Authenticated rows retain their accepted semantics;
 * only structurally eligible missing rows are derived from bounded projection
 * text and exact source/dependency/return bindings.
 */
export function deriveTaskMapReadyProofTargets(input: {
  projection: TaskMapProjectionV1;
  currentness: TaskMapNativeCurrentnessForWorkV1;
  existingProofTargets: TaskMapReadyFrontierProofTargetV1[];
}): TaskMapReadyProofTargetsV1 {
  const projectionDigest =
    diffTaskMapProjections(null, input.projection).currentProjectionDigest;
  if (
    input.currentness.runId !== input.projection.runId
    || input.currentness.inputDigest !== input.projection.inputDigest
    || input.currentness.projectionDigest !== projectionDigest
  ) {
    fail("proof-target derivation is not projection-bound");
  }
  taskMapReadyFrontierCurrentnessBindingDigest(input.currentness);
  const taskById = new Map(
    input.projection.tasks.map((task) => [task.id, task]),
  );
  const dispositions = new Map(
    input.currentness.taskDispositions.map((row) => [
      row.taskId,
      row.disposition,
    ]),
  );
  if (
    dispositions.size !== taskById.size
    || input.currentness.taskDispositions.length !== taskById.size
    || input.currentness.taskDispositions.some((row) =>
      !taskById.has(row.taskId)
    )
  ) {
    fail("proof-target derivation currentness coverage is invalid");
  }

  const existingByTaskId = new Map<
    string,
    TaskMapReadyFrontierProofTargetV1
  >();
  for (const target of input.existingProofTargets) {
    if (existingByTaskId.has(target.taskId)) {
      fail("proof-target derivation repeats an authenticated task ID");
    }
    existingByTaskId.set(target.taskId, structuredClone(target));
  }

  const proofTargets = [...existingByTaskId.values()].filter((target) =>
    taskById.has(target.taskId)
  );
  for (const task of input.projection.tasks) {
    if (existingByTaskId.has(task.id)) continue;
    if (!structurallyEligibleProofTask({
      projection: input.projection,
      dispositions,
      taskById,
      task,
    })) {
      continue;
    }
    const predecessors = expectedPredecessors(
      input.projection,
      taskById,
      task.id,
    );
    if (predecessors === null) {
      fail(`derived proof target for ${task.id} is invalid`);
    }
    const derived: TaskMapReadyFrontierProofTargetV1 = {
      taskId: task.id,
      rootId: task.rootId,
      outcome: task.title,
      input: {
        summary: task.summary,
        contextPointerIds: expectedContextPointerIds(
          input.projection,
          task,
        ),
      },
      predecessors,
      doneDefinition: [task.title],
      permission: {
        requiresExplicitApproval: true,
        approvalGranted: false,
      },
      returnTarget: expectedReturnTarget(task),
      executable: false,
      approvalPackage: structuredClone(APPROVAL_PACKAGE_BOUNDARY),
    };
    if (!projectionBoundProofTargetValid(input.projection, task, derived)) {
      fail(`derived proof target for ${task.id} is invalid`);
    }
    proofTargets.push(derived);
  }

  return buildTaskMapReadyProofTargets({
    projection: input.projection,
    currentness: input.currentness,
    proofTargets,
  });
}

function causalTier(grade: CausalGrade | undefined): 0 | 2 | 3 | 4 {
  switch (grade) {
    case "C4_VALIDATED_PATTERN": return 4;
    case "C3_CAUSAL_HYPOTHESIS": return 3;
    case "C2_ATTRIBUTION_CANDIDATE": return 2;
    default: return 0;
  }
}

function deadlineTier(
  deadlineAt: string | null,
  evaluatedAtMs: number,
): {
  tier: TaskMapReadyFrontierDeadlineTier;
  label: TaskMapReadyFrontierDeadlineTierLabel;
} {
  if (deadlineAt === null) return { tier: 0, label: "none" };
  const remainingMs = Date.parse(deadlineAt) - evaluatedAtMs;
  if (remainingMs < 0) return { tier: 4, label: "overdue" };
  if (remainingMs <= DAY_MS) return { tier: 3, label: "within_24_hours" };
  if (remainingMs <= 3 * DAY_MS) return { tier: 2, label: "within_3_days" };
  if (remainingMs <= 7 * DAY_MS) return { tier: 1, label: "within_7_days" };
  return { tier: 0, label: "later" };
}

function rankInputs(
  task: TaskMapTask,
  prepared: PreparedInput,
): TaskMapReadyFrontierRankInputsV1 {
  const deadlineAt = prepared.deadlines.get(task.id) ?? null;
  const classified = deadlineTier(deadlineAt, prepared.evaluatedAtMs);
  const boundCausalGrade = prepared.causalGrades.get(task.rootId) ?? null;
  return {
    deadlineTier: classified.tier,
    deadlineTierLabel: classified.label,
    newlyUnblockedCount: prepared.newlyUnblockedCount.get(task.id) ?? 0,
    boundCausalGrade,
    currentCausalTier: causalTier(boundCausalGrade ?? undefined),
    deadlineAt,
    stableTaskId: task.id,
  };
}

function compareRankInputs(
  left: TaskMapReadyFrontierRankInputsV1,
  right: TaskMapReadyFrontierRankInputsV1,
): number {
  if (left.deadlineTier !== right.deadlineTier) {
    return right.deadlineTier - left.deadlineTier;
  }
  if (left.newlyUnblockedCount !== right.newlyUnblockedCount) {
    return right.newlyUnblockedCount - left.newlyUnblockedCount;
  }
  if (left.currentCausalTier !== right.currentCausalTier) {
    return right.currentCausalTier - left.currentCausalTier;
  }
  if (left.deadlineAt === null && right.deadlineAt !== null) return 1;
  if (left.deadlineAt !== null && right.deadlineAt === null) return -1;
  if (left.deadlineAt !== null && right.deadlineAt !== null) {
    const deadlineOrder = Date.parse(left.deadlineAt) - Date.parse(right.deadlineAt);
    if (deadlineOrder !== 0) return deadlineOrder;
  }
  return stableCompare(left.stableTaskId, right.stableTaskId);
}

function prepareInput(input: TaskMapReadyFrontierInputV1): PreparedInput {
  const { projection, currentness } = input;
  if (projection.tasks.length > TASKMAP_READY_FRONTIER_LIMITS_V1.maxTasks) {
    fail("task count exceeds the bounded frontier ceiling");
  }
  if (
    input.proofTargets.length
      > TASKMAP_READY_FRONTIER_LIMITS_V1.maxProofTargets
  ) {
    fail("proof-target count exceeds the bounded frontier ceiling");
  }
  const evaluatedAtMs = timestampMs(input.evaluatedAt);
  if (evaluatedAtMs === null) fail("evaluatedAt is invalid");
  if (
    !validDigest(input.terminalOverlay.artifactDigest)
    || !validDigest(input.terminalOverlay.localOwnerScopeDigest)
    || input.terminalOverlay.contractVersion
      !== "taskmap-local-completion-overlay.v1"
    || !validDigest(input.exactDeadlineSourceDigest)
    || !validDigest(input.exactDeadlineBindingDigest)
    || !validDigest(input.causalGradeSourceDigest)
    || !validDigest(input.causalGradeBindingDigest)
  ) {
    fail("an evidence binding is invalid");
  }

  const projectionDigest =
    diffTaskMapProjections(null, projection).currentProjectionDigest;
  if (
    currentness.contractVersion !== "taskmap-native-currentness-gate.v1"
    || currentness.runId !== projection.runId
    || currentness.inputDigest !== projection.inputDigest
    || currentness.projectionDigest !== projectionDigest
  ) {
    fail("currentness is not bound to the projection");
  }

  const taskById = new Map<string, TaskMapTask>();
  for (const task of projection.tasks) {
    if (taskById.has(task.id)) fail("projection repeats a task ID");
    taskById.set(task.id, task);
  }
  const rootIds = new Set(projection.roots.map((root) => root.id));

  const dispositions = new Map<
    string,
    "current" | "needs_lifecycle_review"
  >();
  for (const row of currentness.taskDispositions) {
    if (
      !taskById.has(row.taskId)
      || dispositions.has(row.taskId)
      || (row.disposition !== "current"
        && row.disposition !== "needs_lifecycle_review")
    ) {
      fail("currentness task coverage is invalid");
    }
    dispositions.set(row.taskId, row.disposition);
  }
  if (dispositions.size !== taskById.size) {
    fail("currentness does not cover every projected task");
  }

  const terminalTaskIds = new Set<string>();
  for (const taskId of input.terminalOverlay.terminalTaskIds) {
    if (!taskById.has(taskId) || terminalTaskIds.has(taskId)) {
      fail("terminal overlay task coverage is invalid");
    }
    terminalTaskIds.add(taskId);
  }

  const deadlines = new Map<string, string | null>();
  for (const row of input.exactDeadlines) {
    if (
      !taskById.has(row.taskId)
      || deadlines.has(row.taskId)
      || (row.deadlineAt !== null && timestampMs(row.deadlineAt) === null)
    ) {
      fail("exact-deadline evidence is invalid");
    }
    deadlines.set(row.taskId, row.deadlineAt);
  }
  if (deadlines.size !== taskById.size) {
    fail("exact-deadline evidence does not cover every projected task");
  }

  const causalGrades = new Map<string, CausalGrade>();
  for (const row of input.causalGrades) {
    const root = projection.roots.find((candidate) =>
      candidate.id === row.rootId
    );
    if (
      root === undefined
      || causalGrades.has(row.rootId)
      || ![
        "C0_NO_DATA",
        "C1_CORRELATION",
        "C2_ATTRIBUTION_CANDIDATE",
        "C3_CAUSAL_HYPOTHESIS",
        "C4_VALIDATED_PATTERN",
      ].includes(row.causalGrade)
      || row.causalGrade !== root.causalGrade
    ) {
      fail("causal-grade evidence is invalid");
    }
    causalGrades.set(row.rootId, row.causalGrade);
  }
  if (causalGrades.size !== rootIds.size) {
    fail("causal-grade evidence does not cover every projected root");
  }
  if (
    taskMapReadyFrontierDeadlineBindingDigest({
      projection,
      currentness,
      sourceDigest: input.exactDeadlineSourceDigest,
      rows: input.exactDeadlines,
    }) !== input.exactDeadlineBindingDigest
    || taskMapReadyFrontierCausalGradeBindingDigest({
      projection,
      currentness,
      sourceDigest: input.causalGradeSourceDigest,
      rows: input.causalGrades,
    }) !== input.causalGradeBindingDigest
  ) {
    fail("a typed evidence binding digest does not match its rows");
  }

  const proofTargets = new Map<string, TaskMapReadyFrontierProofTargetV1>();
  for (const target of input.proofTargets) {
    if (!taskById.has(target.taskId) || proofTargets.has(target.taskId)) {
      fail("proof-target coverage is invalid");
    }
    proofTargets.set(target.taskId, target);
  }

  const unresolvedPredecessors = new Map<string, readonly string[]>();
  const activeDependencyTasks = projection.tasks.filter((task) =>
    !terminalTaskIds.has(task.id)
    && !terminalByProjection(task)
    && ATOMIC_TASK_ID.test(task.id)
    && task.reviewState === "accepted"
    && task.openState === "open"
    && dispositions.get(task.id) === "current"
  );
  for (const task of projection.tasks) {
    const unresolved = operationalPredecessorIds(projection, task.id)
      .filter((predecessorId) => {
        const predecessor = taskById.get(predecessorId);
        return !terminalTaskIds.has(predecessorId)
          && !terminalByProjection(predecessor);
      });
    unresolvedPredecessors.set(task.id, unresolved);
  }
  const newlyUnblockedCount = new Map<string, number>();
  for (const task of projection.tasks) newlyUnblockedCount.set(task.id, 0);
  for (const dependent of activeDependencyTasks) {
    const unresolved = unresolvedPredecessors.get(dependent.id) ?? [];
    if (unresolved.length !== 1) continue;
    const predecessorId = unresolved[0]!;
    newlyUnblockedCount.set(
      predecessorId,
      (newlyUnblockedCount.get(predecessorId) ?? 0) + 1,
    );
  }

  return {
    projectionDigest,
    dispositions,
    terminalTaskIds,
    deadlines,
    causalGrades,
    proofTargets,
    taskById,
    unresolvedPredecessors,
    newlyUnblockedCount,
    evaluatedAtMs,
  };
}

function evaluateTask(
  input: TaskMapReadyFrontierInputV1,
  prepared: PreparedInput,
  task: TaskMapTask,
): TaskMapReadyFrontierEvaluationV1 {
  const blockers: TaskMapReadyFrontierBlockerV1[] = [];
  const add = (
    code: TaskMapReadyFrontierBlockerCode,
    relatedTaskId?: string,
  ): void => {
    blockers.push(
      relatedTaskId === undefined ? { code } : { code, relatedTaskId },
    );
  };

  if (prepared.terminalTaskIds.has(task.id) || terminalByProjection(task)) {
    add("terminal_task");
    return {
      taskId: task.id,
      rootId: task.rootId,
      readiness: "blocked",
      blockers,
      checks: taskMapExecutableNowChecks(blockers),
      rankInputs: rankInputs(task, prepared),
    };
  }

  if (input.projection.runStatus !== "accepted" || input.projection.rejections.length > 0) {
    add("projection_not_accepted");
  }
  const root = input.projection.roots.find((row) => row.id === task.rootId);
  if (root === undefined || !root.taskIds.includes(task.id)) {
    add("invalid_root_membership");
  }
  if (!ATOMIC_TASK_ID.test(task.id)) add("not_atomic_task");
  if (task.reviewState !== "accepted") add("not_accepted");
  if (task.openState !== "open") add("not_open");
  if (prepared.dispositions.get(task.id) !== "current") add("not_current");
  if (!sourceContractComplete(input.projection, task)) {
    add("source_contract_incomplete");
  }

  const target = prepared.proofTargets.get(task.id);
  if (target === undefined) {
    add("proof_target_missing");
  } else {
    if (target.taskId !== task.id || target.rootId !== task.rootId) {
      add("proof_target_binding_invalid");
    }
    if (!inputContractComplete(input.projection, task, target)) {
      add("input_contract_incomplete");
    }
    if (!doneContractComplete(target)) add("done_contract_incomplete");
    if (!permissionContractValid(target)) {
      add("permission_contract_invalid");
    }
    if (!returnRouteComplete(input.projection, task, target)) {
      add("return_route_incomplete");
    }
    const expected = expectedPredecessors(
      input.projection,
      prepared.taskById,
      task.id,
    );
    if (
      expected === null
      || !Array.isArray(target.predecessors)
      || target.predecessors.length
        > TASKMAP_READY_FRONTIER_LIMITS_V1.maxPredecessors
      || !sameCanonical(target.predecessors, expected)
    ) {
      add("predecessor_contract_mismatch");
    }
    if (!sameCanonical(target.approvalPackage, APPROVAL_PACKAGE_BOUNDARY)) {
      add("approval_package_contract_invalid");
    }
    if (taskMapProjectionPrivacyLeakReasons(target).length > 0) {
      add("privacy_boundary_invalid");
    }
  }

  for (const predecessorId of prepared.unresolvedPredecessors.get(task.id) ?? []) {
    add("dependency_unresolved", predecessorId);
  }

  return {
    taskId: task.id,
    rootId: task.rootId,
    readiness: blockers.length === 0 ? "ready" : "blocked",
    blockers,
    checks: taskMapExecutableNowChecks(blockers),
    rankInputs: rankInputs(task, prepared),
  };
}

export function buildTaskMapReadyFrontier(
  input: TaskMapReadyFrontierInputV1,
): TaskMapReadyFrontierV1 {
  const prepared = prepareInput(input);
  const evaluations = input.projection.tasks
    .map((task) => evaluateTask(input, prepared, task))
    .sort((left, right) => stableCompare(left.taskId, right.taskId));
  const evaluationsByTaskId = new Map(
    evaluations.map((evaluation) => [evaluation.taskId, evaluation]),
  );
  const ranked = [...prepared.proofTargets.values()]
    .filter((target) => evaluationsByTaskId.get(target.taskId)?.readiness === "ready")
    .map((target) => ({
      target,
      rankInputs: evaluationsByTaskId.get(target.taskId)!.rankInputs,
    }))
    .sort((left, right) => compareRankInputs(left.rankInputs, right.rankInputs));
  const readyLeaves: TaskMapReadyFrontierLeafV1[] = ranked.map(
    ({ target, rankInputs: inputs }, index) => ({
      taskId: target.taskId,
      rootId: target.rootId,
      rank: index + 1,
      readiness: "ready_for_owner_approval",
      approvalGranted: false,
      executable: false,
      rankInputs: { ...inputs },
      proofTarget: structuredClone(target),
    }),
  );

  const base = {
    contractVersion: TASKMAP_READY_FRONTIER_VERSION,
    policyVersion: TASKMAP_READY_FRONTIER_POLICY_VERSION,
    evaluatedAt: input.evaluatedAt,
    projection: {
      contractVersion: input.projection.contractVersion,
      runId: input.projection.runId,
      inputDigest: input.projection.inputDigest,
      generatedAt: input.projection.generatedAt,
      projectionDigest: prepared.projectionDigest,
    },
    currentness: currentnessBinding(input.currentness),
    terminalOverlay: {
      ...input.terminalOverlay,
      terminalTaskIds: [...input.terminalOverlay.terminalTaskIds].sort(stableCompare),
    },
    exactDeadlineSourceDigest: input.exactDeadlineSourceDigest,
    exactDeadlineBindingDigest: input.exactDeadlineBindingDigest,
    causalGradeSourceDigest: input.causalGradeSourceDigest,
    causalGradeBindingDigest: input.causalGradeBindingDigest,
    evaluations,
    readyLeaves,
    authorityBoundary: {
      membershipCreated: false as const,
      readinessCreatedByCausalData: false as const,
      approvalGranted: false as const,
      executionStarted: false as const,
      completionGranted: false as const,
    },
    privacy: {
      sourceBodiesStored: false as const,
      localPathsStored: false as const,
      rawBiometricsStored: false as const,
    },
  };
  return {
    ...base,
    artifactDigest: taskMapContractDigest(base),
  };
}

/**
 * Rebuild a persisted frontier from its projection-bound evidence inputs.
 *
 * The deadline rows are recoverable from the sealed per-task rank inputs;
 * causal grades come from the accepted projection, while proof targets and
 * the terminal overlay must be supplied by their independently revalidated
 * owner-scoped sources. Canonical equality with the rebuild prevents callers
 * from treating an unsealed readyTaskIds/status response as approval evidence.
 */
export function validateTaskMapReadyFrontier(
  value: unknown,
  input: ValidateTaskMapReadyFrontierInputV1,
): TaskMapReadyFrontierV1 {
  if (!plainObject(value)) fail("persisted frontier is not an object");
  const expectedKeys = [
    "contractVersion",
    "policyVersion",
    "evaluatedAt",
    "projection",
    "currentness",
    "terminalOverlay",
    "exactDeadlineSourceDigest",
    "exactDeadlineBindingDigest",
    "causalGradeSourceDigest",
    "causalGradeBindingDigest",
    "evaluations",
    "readyLeaves",
    "authorityBoundary",
    "privacy",
    "artifactDigest",
  ].sort();
  if (!sameCanonical(Object.keys(value).sort(), expectedKeys)) {
    fail("persisted frontier keys are invalid");
  }
  if (
    value.contractVersion !== TASKMAP_READY_FRONTIER_VERSION
    || value.policyVersion !== TASKMAP_READY_FRONTIER_POLICY_VERSION
    || typeof value.evaluatedAt !== "string"
    || !Array.isArray(value.evaluations)
    || value.evaluations.length
      > TASKMAP_READY_FRONTIER_LIMITS_V1.maxTasks
  ) {
    fail("persisted frontier boundary is invalid");
  }
  const exactDeadlines = value.evaluations.map((raw, index) => {
    if (
      !plainObject(raw)
      || typeof raw.taskId !== "string"
      || !plainObject(raw.rankInputs)
      || (
        raw.rankInputs.deadlineAt !== null
        && typeof raw.rankInputs.deadlineAt !== "string"
      )
    ) {
      fail(`persisted frontier evaluation ${index} is invalid`);
    }
    return {
      taskId: raw.taskId,
      deadlineAt: raw.rankInputs.deadlineAt as string | null,
    };
  });
  const rebuilt = buildTaskMapReadyFrontier({
    projection: input.projection,
    currentness: input.currentness,
    evaluatedAt: value.evaluatedAt,
    terminalOverlay: input.terminalOverlay,
    exactDeadlineSourceDigest: value.exactDeadlineSourceDigest as string,
    exactDeadlineBindingDigest: value.exactDeadlineBindingDigest as string,
    exactDeadlines,
    causalGradeSourceDigest: value.causalGradeSourceDigest as string,
    causalGradeBindingDigest: value.causalGradeBindingDigest as string,
    causalGrades: input.projection.roots.map((root) => ({
      rootId: root.id,
      causalGrade: root.causalGrade,
    })),
    proofTargets: input.proofTargets,
  });
  if (!sameCanonical(rebuilt, value)) {
    fail("persisted frontier seal or evidence binding is invalid");
  }
  return rebuilt;
}
