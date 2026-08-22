import { constants as fsConstants } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";

import { taskMapProjectionPrivacyLeakReasons } from "./harness.js";
import {
  inspectTaskMapAgentHandoff,
  type TaskMapAgentHandoffManifestV1,
  type TaskMapAgentHandoffRuntimeRequestV1,
} from "./agent-handoff-manifest.js";
import {
  assertTaskMapExactProvenance,
  buildTaskMapExactProvenance,
  taskMapExactProvenanceAdapterExpectation,
  type TaskMapExactProvenanceTaskProofV1,
  type TaskMapExactProvenanceV1,
} from "./exact-provenance-companion.js";
import {
  inspectTaskMapLocalApprovalOperationalContext,
  TASKMAP_LOCAL_APPROVAL_LIMITS_V1,
  type InspectTaskMapLocalApprovalInputV1,
  type TaskMapLocalOperationalSourceEvidenceV1,
  type TaskMapLocalQuartetBindingV1,
} from "./local-approval-package.js";
import {
  assertTaskMapSourceSnapshot,
  buildTaskMapSourceEnvelope,
  buildTaskMapSourceSnapshot,
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";

import {
  loadTaskMapNativeCandidateAcceptanceStore,
} from "./native-candidate-acceptance.js";
import {
  TASKMAP_STRATEGY_SOURCE_ADAPTER_POLICY_DIGEST,
  TASKMAP_STRATEGY_SOURCE_ADAPTER_VERSION,
  TASKMAP_STRATEGY_SOURCE_EVIDENCE_FILENAME,
} from "./strategy-source-adapter.js";
import type {
  TaskMapSourceSnapshotV1,
} from "./types.js";
export const TASKMAP_AGENT_HANDOFF_PREFLIGHT_VERSION =
  "taskmap-agent-handoff-preflight.v1" as const;
export const TASKMAP_AGENT_WORKSPACE_BINDING_VERSION =
  "taskmap-agent-workspace-binding.v1" as const;
export const TASKMAP_OPERATIONAL_CRITERIA_ASSESSMENT_VERSION =
  "taskmap-operational-criteria-assessment.v1" as const;
export const TASKMAP_OPERATIONAL_CRITERIA_POLICY_VERSION =
  "taskmap-operational-criteria-policy.1" as const;
export const TASKMAP_AGENT_HANDOFF_PREFLIGHT_SUMMARY_VERSION =
  "taskmap-agent-handoff-preflight-summary.v1" as const;
export const TASKMAP_AGENT_ADAPTER_HANDOFF_PREFLIGHT_VERSION =
  "taskmap-agent-adapter-handoff-preflight.v1" as const;
export const TASKMAP_AGENT_ADAPTER_RUNTIME_REQUEST_VERSION =
  "taskmap-agent-adapter-runtime-request.v1" as const;

export const TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1 = Object.freeze({
  maxArtifactBytes: TASKMAP_LOCAL_APPROVAL_LIMITS_V1.maxArtifactBytes,
  maxSummaryBytes: 16 * 1024,
  maxTitleCharacters: 240,
  maxVersionedContextRows:
    TASKMAP_LOCAL_APPROVAL_LIMITS_V1.maxContextPointers + 2,
  maxCriteria: TASKMAP_LOCAL_APPROVAL_LIMITS_V1.maxDoneItems,
} as const);

const DIGEST = /^[a-f0-9]{64}$/;
const TASK_ID = /^tmt_[A-Za-z0-9._-]{1,256}$/;
const ROOT_ID = /^tmr_[A-Za-z0-9._-]{1,256}$/;
const PROJECT_ID = /^tmproject_[a-f0-9]{64}$/;
const WORKSPACE_ID = /^tmworkspace_[a-f0-9]{64}$/;
const WORKSPACE_BINDING_DOMAIN = "taskmap-agent-workspace-binding.1";
const CRITERIA_ASSESSMENT_DOMAIN =
  "taskmap-operational-criteria-assessment.1";
const START_IDEMPOTENCY_DOMAIN =
  "taskmap-agent-start-idempotency.1";
const PREFLIGHT_DOMAIN = "taskmap-agent-handoff-preflight.1";
const HANDOFF_MANIFEST_DOMAIN = "taskmap-agent-handoff-manifest.1";
const SOURCE_EVIDENCE_DOMAIN =
  "taskmap-agent-handoff-source-evidence.1";
const EXPECTED_PROVENANCE_DOMAIN =
  "taskmap-agent-handoff-expected-provenance.1";
const EXPECTED_OPERATIONAL_DOMAIN =
  "taskmap-agent-handoff-expected-operational-inputs.1";
const PREFLIGHT_ID = /^tmhandoffpreflight_([a-f0-9]{64})$/;
const HANDOFF_MANIFEST_ID = /^tmhandoff_([a-f0-9]{64})$/;
const PACKAGE_ID = /^tmlocalpackage_([a-f0-9]{64})$/;
const ADAPTER_RUNTIME_REQUEST_DOMAIN =
  "taskmap-agent-adapter-runtime-request.1";
const ADAPTER_PREFLIGHT_DOMAIN =
  "taskmap-agent-adapter-handoff-preflight.1";
const ADAPTER_START_IDEMPOTENCY_DOMAIN =
  "taskmap-agent-adapter-start-idempotency.1";
const ADAPTER_PREFLIGHT_ID =
  /^tmadapterpreflight_([a-f0-9]{64})$/;
const OPERATIONAL_RELATIONS = new Set([
  "advances",
  "depends_on",
  "blocks",
  "supersedes",
]);

type JsonObject = Record<string, unknown>;

export interface TaskMapAgentWorkspaceBindingDraftV1 {
  projectId: string;
  repositoryIdentityDigest: string;
  workspaceRevisionDigest: string;
}

export interface TaskMapAgentWorkspaceBindingV1 {
  contractVersion: typeof TASKMAP_AGENT_WORKSPACE_BINDING_VERSION;
  bindingId: string;
  bindingDigest: string;
  projectId: string;
  repositoryIdentityDigest: string;
  workspaceRevisionDigest: string;
  capabilities: ["read", "write", "test"];
  localPathStored: false;
}

export type TaskMapOperationalCriterionState = "met" | "unmet" | "unknown";

export interface TaskMapOperationalCriterionAssessmentDraftV1 {
  criterionIndex: number;
  state: TaskMapOperationalCriterionState;
  evidenceDigest: string;
}

export interface BuildTaskMapOperationalCriteriaAssessmentInputV1 {
  handoffManifestDigest: string;
  operationalContextDigest: string;
  exactProvenanceDigest: string;
  workspaceBindingDigest: string;
  workspaceRevisionDigest: string;
  currentWorkArtifactDigest: string;
  taskId: string;
  rootId: string;
  doneDefinition: string[];
  criteria: TaskMapOperationalCriterionAssessmentDraftV1[];
}

export interface TaskMapOperationalCriteriaAssessmentV1 {
  contractVersion:
    typeof TASKMAP_OPERATIONAL_CRITERIA_ASSESSMENT_VERSION;
  assessmentDigest: string;
  policyVersion: typeof TASKMAP_OPERATIONAL_CRITERIA_POLICY_VERSION;
  handoffManifestDigest: string;
  operationalContextDigest: string;
  exactProvenanceDigest: string;
  workspaceBindingDigest: string;
  workspaceRevisionDigest: string;
  currentWorkArtifactDigest: string;
  taskId: string;
  rootId: string;
  doneDefinitionDigest: string;
  criteria: TaskMapOperationalCriterionAssessmentDraftV1[];
}

export interface InspectTaskMapAgentHandoffPreflightInputV1
  extends InspectTaskMapLocalApprovalInputV1 {
  exactProvenance: TaskMapExactProvenanceV1;
  expectedProvenance: {
    sourceSnapshotDigest: string;
    adapterVersion: string;
    adapterPolicyDigest: string;
  };
  expectedOperational: {
    workspaceBindingDigest: string;
    criteriaAssessmentDigest: string;
  };
  workspaceBinding: TaskMapAgentWorkspaceBindingV1;
  criteriaAssessment: TaskMapOperationalCriteriaAssessmentV1;
}

export interface TaskMapAgentHandoffPreflightDependenciesV1 {
  inspectHandoff: typeof inspectTaskMapAgentHandoff;
  inspectOperationalContext:
    typeof inspectTaskMapLocalApprovalOperationalContext;
}

export interface TaskMapAgentHandoffPreflightV1 {
  contractVersion: typeof TASKMAP_AGENT_HANDOFF_PREFLIGHT_VERSION;
  preflightId: string;
  preflightDigest: string;
  handoffManifestDigest: string;
  operationalExpectationDigest: string;
  localOwnerScopeDigest: string;
  quartet: TaskMapLocalQuartetBindingV1;
  task: {
    taskId: string;
    rootId: string;
    taskTitle: string;
    rootTitle: string;
    outcome: string;
    input: TaskMapAgentHandoffManifestV1["task"]["input"];
    predecessors: TaskMapAgentHandoffManifestV1["task"]["predecessors"];
    doneDefinition: string[];
    returnTarget: TaskMapAgentHandoffManifestV1["task"]["returnTarget"];
    routeNodeIds: string[];
  };
  provenance: {
    artifactDigest: string;
    producerVersion: string;
    producerPolicyDigest: string;
    expectationDigest: string;
    expectedSourceSnapshotDigest: string;
    expectedAdapterVersion: string;
    expectedAdapterPolicyDigest: string;
    taskProof: TaskMapExactProvenanceTaskProofV1;
    rootDerivationDigest: string;
    routeEdgeDerivationDigests: string[];
    sourceEvidenceDigest: string;
    versionedContext: Array<{
      pointerId: string;
      roles: TaskMapLocalOperationalSourceEvidenceV1["roles"];
      sourceKind: TaskMapLocalOperationalSourceEvidenceV1["sourceKind"];
      sourceVersion: string;
      evidenceDigest: string;
    }>;
    excludedUnversionedContextPointerIds: string[];
  };
  workspaceBinding: TaskMapAgentWorkspaceBindingV1;
  criteriaAssessment: TaskMapOperationalCriteriaAssessmentV1;
  runtimeRequest: TaskMapAgentHandoffRuntimeRequestV1;
  startIdempotencyKey: string;
  boundary: {
    state: "validated_not_started";
    humanApprovalRequired: true;
    dispatchAuthorized: false;
    processStartAuthorized: false;
    codexTaskStartAuthorized: false;
    taskCreated: false;
    codexTaskId: null;
    sourceWritebackAuthorized: false;
    sourceCompletionAuthorized: false;
    outcomeVerificationAuthorized: false;
  };
  privacy: {
    sourceRowsStored: false;
    sourceBodiesStored: false;
    localPathsStored: false;
    rawBiometricsStored: false;
    credentialsStored: false;
    participantIdentitiesStored: false;
    unboundedWorkspaceContextStored: false;
  };
}

export interface TaskMapAgentHandoffPreflightSummaryV1 {
  contractVersion:
    typeof TASKMAP_AGENT_HANDOFF_PREFLIGHT_SUMMARY_VERSION;
  state: "validated_not_started";
  preflightId: string;
  preflightDigest: string;
  handoffManifestDigest: string;
  packageId: string;
  packageDigest: string;
  taskId: string;
  rootId: string;
  exactProvenanceDigest: string;
  workspaceBindingDigest: string;
  criteriaAssessmentDigest: string;
  runtimeRequest: TaskMapAgentHandoffRuntimeRequestV1;
  startIdempotencyKey: string;
  taskCreated: false;
  codexTaskId: null;
  processStartAuthorized: false;
  codexTaskStartAuthorized: false;
  dispatchAuthorized: false;
  sourceWritebackAuthorized: false;
  returnActionsAuthorized: false;
  sourceCompletionAuthorized: false;
  outcomeVerificationAuthorized: false;
}

export type TaskMapAgentHandoffAdapterV1 = "codex" | "claude_code";
export type TaskMapAgentAdapterOperationV1 =
  | "create_fresh_codex_task"
  | "create_fresh_claude_code_session";

export interface InspectTaskMapAgentAdapterHandoffPreflightInputV1 {
  adapter: TaskMapAgentHandoffAdapterV1;
  preflightInput: InspectTaskMapAgentHandoffPreflightInputV1;
}

export interface TaskMapAgentAdapterRuntimeRequestV1 {
  contractVersion: typeof TASKMAP_AGENT_ADAPTER_RUNTIME_REQUEST_VERSION;
  adapter: TaskMapAgentHandoffAdapterV1;
  operation: TaskMapAgentAdapterOperationV1;
  taskMode: "fresh";
  packageId: string;
  packageDigest: string;
  packagePayloadDigest: string;
  corePreflightId: string;
  corePreflightDigest: string;
  taskId: string;
  rootId: string;
  workspaceBindingDigest: string;
  requestDigest: string;
}

export interface TaskMapAgentAdapterHandoffPreflightV1 {
  contractVersion:
    typeof TASKMAP_AGENT_ADAPTER_HANDOFF_PREFLIGHT_VERSION;
  adapterPreflightId: string;
  adapterPreflightDigest: string;
  adapter: TaskMapAgentHandoffAdapterV1;
  packageId: string;
  packageDigest: string;
  corePreflightId: string;
  corePreflightDigest: string;
  taskId: string;
  rootId: string;
  workspaceBindingDigest: string;
  runtimeRequest: TaskMapAgentAdapterRuntimeRequestV1;
  startIdempotencyKey: string;
  boundary: {
    state: "validated_not_started";
    humanApprovalRequired: true;
    dispatchAuthorized: false;
    processStartAuthorized: false;
    adapterSessionStartAuthorized: false;
    taskCreated: false;
    adapterSessionId: null;
    sourceWritebackAuthorized: false;
    sourceCompletionAuthorized: false;
    outcomeVerificationAuthorized: false;
  };
  privacy: {
    sourceBodiesStored: false;
    localPathsStored: false;
    credentialsStored: false;
    participantIdentitiesStored: false;
    unboundedWorkspaceContextStored: false;
  };
}

function fail(message: string): never {
  throw new Error(`Task Map agent handoff preflight unavailable: ${message}`);
}

function assertPlainObject(
  value: unknown,
  label: string,
): asserts value is JsonObject {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(`${label} must be a plain object`);
  }
}

function assertExactKeys(
  value: JsonObject,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])
  ) {
    fail(`${label} fields are invalid`);
  }
}

function assertDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !DIGEST.test(value)) {
    fail(`${label} must be a lowercase SHA-256 digest`);
  }
}

function assertVersion(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)
  ) {
    fail(`${label} is invalid`);
  }
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return taskMapContractCanonicalJson(left) === taskMapContractCanonicalJson(right);
}

function cloneWorkspaceBinding(
  binding: TaskMapAgentWorkspaceBindingV1,
): TaskMapAgentWorkspaceBindingV1 {
  return {
    ...binding,
    capabilities: [...binding.capabilities] as ["read", "write", "test"],
  };
}

export function buildTaskMapAgentWorkspaceBinding(
  input: TaskMapAgentWorkspaceBindingDraftV1,
): TaskMapAgentWorkspaceBindingV1 {
  assertPlainObject(input, "workspace binding input");
  assertExactKeys(
    input,
    ["projectId", "repositoryIdentityDigest", "workspaceRevisionDigest"],
    "workspace binding input",
  );
  if (!PROJECT_ID.test(input.projectId)) fail("projectId is not opaque");
  assertDigest(input.repositoryIdentityDigest, "repositoryIdentityDigest");
  assertDigest(input.workspaceRevisionDigest, "workspaceRevisionDigest");
  const core = {
    contractVersion: TASKMAP_AGENT_WORKSPACE_BINDING_VERSION,
    projectId: input.projectId,
    repositoryIdentityDigest: input.repositoryIdentityDigest,
    workspaceRevisionDigest: input.workspaceRevisionDigest,
    capabilities: ["read", "write", "test"] as ["read", "write", "test"],
    localPathStored: false as const,
  };
  const bindingDigest = taskMapContractDigest({
    domain: WORKSPACE_BINDING_DOMAIN,
    ...core,
  });
  return {
    ...core,
    bindingId: `tmworkspace_${bindingDigest}`,
    bindingDigest,
  };
}

export function assertTaskMapAgentWorkspaceBinding(
  value: TaskMapAgentWorkspaceBindingV1,
): TaskMapAgentWorkspaceBindingV1 {
  assertPlainObject(value, "workspace binding");
  assertExactKeys(value, [
    "contractVersion",
    "bindingId",
    "bindingDigest",
    "projectId",
    "repositoryIdentityDigest",
    "workspaceRevisionDigest",
    "capabilities",
    "localPathStored",
  ], "workspace binding");
  if (
    value.contractVersion !== TASKMAP_AGENT_WORKSPACE_BINDING_VERSION
    || typeof value.bindingId !== "string"
    || !WORKSPACE_ID.test(value.bindingId)
    || value.localPathStored !== false
    || !Array.isArray(value.capabilities)
    || !sameCanonical(value.capabilities, ["read", "write", "test"])
  ) {
    fail("workspace binding boundary is invalid");
  }
  assertDigest(value.bindingDigest, "workspace bindingDigest");
  const rebuilt = buildTaskMapAgentWorkspaceBinding({
    projectId: value.projectId,
    repositoryIdentityDigest: value.repositoryIdentityDigest,
    workspaceRevisionDigest: value.workspaceRevisionDigest,
  });
  if (!sameCanonical(rebuilt, value)) {
    fail("workspace binding digest is invalid");
  }
  return rebuilt;
}

function validateCriteria(
  criteria: TaskMapOperationalCriterionAssessmentDraftV1[],
  doneDefinition: readonly string[],
): TaskMapOperationalCriterionAssessmentDraftV1[] {
  if (
    !Array.isArray(criteria)
    || criteria.length === 0
    || criteria.length !== doneDefinition.length
    || criteria.length > TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1.maxCriteria
  ) {
    fail("criteria do not exhaust the done definition");
  }
  const normalized = criteria.map((criterion, index) => {
    assertPlainObject(criterion, `criterion ${index}`);
    assertExactKeys(
      criterion,
      ["criterionIndex", "state", "evidenceDigest"],
      `criterion ${index}`,
    );
    if (
      criterion.criterionIndex !== index
      || (
        criterion.state !== "met"
        && criterion.state !== "unmet"
        && criterion.state !== "unknown"
      )
    ) {
      fail("criterion ordering or state is invalid");
    }
    assertDigest(criterion.evidenceDigest, `criterion ${index} evidenceDigest`);
    return { ...criterion };
  });
  return normalized;
}

export function buildTaskMapOperationalCriteriaAssessment(
  input: BuildTaskMapOperationalCriteriaAssessmentInputV1,
): TaskMapOperationalCriteriaAssessmentV1 {
  assertPlainObject(input, "criteria assessment input");
  assertExactKeys(input, [
    "handoffManifestDigest",
    "operationalContextDigest",
    "exactProvenanceDigest",
    "workspaceBindingDigest",
    "workspaceRevisionDigest",
    "currentWorkArtifactDigest",
    "taskId",
    "rootId",
    "doneDefinition",
    "criteria",
  ], "criteria assessment input");
  assertDigest(input.handoffManifestDigest, "handoffManifestDigest");
  assertDigest(input.operationalContextDigest, "operationalContextDigest");
  assertDigest(input.exactProvenanceDigest, "exactProvenanceDigest");
  assertDigest(input.workspaceBindingDigest, "workspaceBindingDigest");
  assertDigest(input.workspaceRevisionDigest, "workspaceRevisionDigest");
  assertDigest(input.currentWorkArtifactDigest, "currentWorkArtifactDigest");
  if (!TASK_ID.test(input.taskId) || !ROOT_ID.test(input.rootId)) {
    fail("criteria assessment task identity is invalid");
  }
  if (
    !Array.isArray(input.doneDefinition)
    || input.doneDefinition.length === 0
    || input.doneDefinition.length
      > TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1.maxCriteria
  ) {
    fail("criteria assessment done definition is invalid");
  }
  const criteria = validateCriteria(input.criteria, input.doneDefinition);
  const core = {
    contractVersion: TASKMAP_OPERATIONAL_CRITERIA_ASSESSMENT_VERSION,
    policyVersion: TASKMAP_OPERATIONAL_CRITERIA_POLICY_VERSION,
    handoffManifestDigest: input.handoffManifestDigest,
    operationalContextDigest: input.operationalContextDigest,
    exactProvenanceDigest: input.exactProvenanceDigest,
    workspaceBindingDigest: input.workspaceBindingDigest,
    workspaceRevisionDigest: input.workspaceRevisionDigest,
    currentWorkArtifactDigest: input.currentWorkArtifactDigest,
    taskId: input.taskId,
    rootId: input.rootId,
    doneDefinitionDigest: taskMapContractDigest(input.doneDefinition),
    criteria,
  };
  return {
    ...core,
    assessmentDigest: taskMapContractDigest({
      domain: CRITERIA_ASSESSMENT_DOMAIN,
      ...core,
    }),
  };
}

function assertTaskMapOperationalCriteriaAssessment(
  value: TaskMapOperationalCriteriaAssessmentV1,
  expected: Omit<
    BuildTaskMapOperationalCriteriaAssessmentInputV1,
    "criteria"
  >,
): TaskMapOperationalCriteriaAssessmentV1 {
  assertPlainObject(value, "criteria assessment");
  assertExactKeys(value, [
    "contractVersion",
    "assessmentDigest",
    "policyVersion",
    "handoffManifestDigest",
    "operationalContextDigest",
    "exactProvenanceDigest",
    "workspaceBindingDigest",
    "workspaceRevisionDigest",
    "currentWorkArtifactDigest",
    "taskId",
    "rootId",
    "doneDefinitionDigest",
    "criteria",
  ], "criteria assessment");
  if (
    value.contractVersion !== TASKMAP_OPERATIONAL_CRITERIA_ASSESSMENT_VERSION
    || value.policyVersion !== TASKMAP_OPERATIONAL_CRITERIA_POLICY_VERSION
  ) {
    fail("criteria assessment policy is unsupported");
  }
  assertDigest(value.assessmentDigest, "assessmentDigest");
  const rebuilt = buildTaskMapOperationalCriteriaAssessment({
    ...expected,
    criteria: value.criteria,
  });
  if (!sameCanonical(rebuilt, value)) {
    fail("criteria assessment is stale or invalid");
  }
  return rebuilt;
}

function versionedContext(
  rows: readonly TaskMapLocalOperationalSourceEvidenceV1[],
): {
  versioned: TaskMapAgentHandoffPreflightV1["provenance"]["versionedContext"];
  excluded: string[];
} {
  const versioned: TaskMapAgentHandoffPreflightV1["provenance"]["versionedContext"] =
    [];
  const excluded: string[] = [];
  for (const row of rows) {
    if (row.sourceVersion === null || row.sourceVersion.trim().length === 0) {
      excluded.push(row.pointerId);
      continue;
    }
    const core = {
      pointerId: row.pointerId,
      roles: [...row.roles],
      sourceKind: row.sourceKind,
      sourceVersion: row.sourceVersion,
    };
    versioned.push({
      ...core,
      evidenceDigest: taskMapContractDigest({
        domain: SOURCE_EVIDENCE_DOMAIN,
        ...core,
        authority: row.authority,
        syncMode: row.syncMode,
        capabilities: row.capabilities,
        citations: row.citations,
      }),
    });
  }
  if (
    versioned.length
      > TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1.maxVersionedContextRows
  ) {
    fail("versioned source evidence exceeds the bound");
  }
  return {
    versioned: versioned.sort((a, b) => a.pointerId.localeCompare(b.pointerId)),
    excluded: excluded.sort(),
  };
}

function terminalPredecessor(
  row: TaskMapAgentHandoffManifestV1["task"]["predecessors"][number],
): boolean {
  return (
    row.reviewState === "source_complete"
    && row.openState === "completed"
  );
}

function routeEdgeProofs(
  manifest: TaskMapAgentHandoffManifestV1,
  provenance: TaskMapExactProvenanceV1,
  taskProofDigest: string,
): string[] {
  const route = manifest.task.routeNodeIds;
  const directManualEnvelope = provenance.sourceSnapshot.envelopes.find(
    (envelope) => (
      envelope.envelopeId === provenance.tasks.find(
        (task) => task.proofDigest === taskProofDigest,
      )?.sourceEnvelopeId
      && envelope.sourceKind === "manual"
      && envelope.objectType === "authoritative_task"
    ),
  );
  const directRoot = provenance.roots.find(
    (root) => root.rootId === manifest.task.rootId,
  );
  if (
    route.length === 2
    && route[0] === manifest.task.rootId
    && route[1] === manifest.task.taskId
    && directManualEnvelope !== undefined
    && directRoot?.currentTaskIds.includes(manifest.task.taskId)
    && directRoot.currentTaskProofDigests.includes(taskProofDigest)
  ) {
    return [];
  }
  const derivations: string[] = [];
  for (let index = 0; index < route.length - 1; index += 1) {
    const left = route[index]!;
    const right = route[index + 1]!;
    const matches = provenance.edges.filter((edge) => (
      OPERATIONAL_RELATIONS.has(edge.relation)
      && edge.from === left
      && edge.to === right
      && edge.executionEvidence === "exact_task_source"
      && edge.exactTaskProofDigests.includes(taskProofDigest)
    ));
    if (matches.length !== 1) {
      fail("route is not uniquely backed by exact task-source evidence");
    }
    derivations.push(matches[0]!.derivationDigest);
  }
  return derivations;
}

export function taskMapAgentHandoffPreflightDigest(
  preflight: Omit<
    TaskMapAgentHandoffPreflightV1,
    "preflightId" | "preflightDigest"
  >,
): string {
  return taskMapContractDigest({
    domain: PREFLIGHT_DOMAIN,
    ...preflight,
  });
}

export async function inspectTaskMapAgentHandoffPreflight(
  input: InspectTaskMapAgentHandoffPreflightInputV1,
  dependencies: Partial<TaskMapAgentHandoffPreflightDependenciesV1> = {},
): Promise<TaskMapAgentHandoffPreflightV1> {
  assertPlainObject(input, "preflight input");
  const allowed = [
    "taskMapRoot",
    "ownerRoot",
    ...(input.expectedOwnerScopeDigest === undefined
      ? [] : ["expectedOwnerScopeDigest"]),
    ...(input.taskId === undefined ? [] : ["taskId"]),
    "exactProvenance",
    "expectedProvenance",
    "expectedOperational",
    "workspaceBinding",
    "criteriaAssessment",
  ];
  assertExactKeys(input, allowed, "preflight input");
  const localInput: InspectTaskMapLocalApprovalInputV1 = {
    taskMapRoot: input.taskMapRoot,
    ownerRoot: input.ownerRoot,
    ...(input.expectedOwnerScopeDigest === undefined
      ? {}
      : { expectedOwnerScopeDigest: input.expectedOwnerScopeDigest }),
    ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
  };
  const readHandoff =
    dependencies.inspectHandoff ?? inspectTaskMapAgentHandoff;
  const readOperationalContext =
    dependencies.inspectOperationalContext
      ?? inspectTaskMapLocalApprovalOperationalContext;
  const handoff = await readHandoff(localInput);
  const local = await readOperationalContext(localInput);
  if (
    local.response.status !== "package_ready"
    || local.response.approvalAuthorizationId === null
    || local.response.approvalAuthorizationDigest === null
    || local.response.packageId === null
    || local.response.packageDigest === null
    || local.response.preparationReceiptId === null
    || !sameCanonical(handoff.manifest.quartet, local.inspection.quartet)
    || !sameCanonical(handoff.manifest.task, local.inspection.task)
    || handoff.manifest.preparation.prepareIdempotencyKey
      !== local.response.prepareIdempotencyKey
    || handoff.manifest.preparation.approvalAuthorizationId
      !== local.response.approvalAuthorizationId
    || handoff.manifest.preparation.approvalAuthorizationDigest
      !== local.response.approvalAuthorizationDigest
    || handoff.manifest.preparation.packageId
      !== local.response.packageId
    || handoff.manifest.preparation.packageDigest
      !== local.response.packageDigest
    || handoff.manifest.preparation.preparationReceiptId
      !== local.response.preparationReceiptId
    || handoff.manifest.proofDigest !== local.response.proofDigest
  ) {
    fail("M4A and operational context do not share one exact package");
  }
  if (
    handoff.manifest.localOwnerScopeDigest
      !== local.inspection.localOwnerScopeDigest
    || local.context.contextDigest.length !== 64
    || local.context.task.taskId !== handoff.manifest.task.taskId
    || local.context.task.rootId !== handoff.manifest.task.rootId
  ) {
    fail("operational context is not bound to the M4A handoff");
  }
  if (
    local.context.task.reviewState !== "accepted"
    || local.context.task.openState !== "open"
    || (
      local.context.task.sourceStatus !== "open"
      && local.context.task.sourceStatus !== "in_progress"
    )
  ) {
    fail("task is terminal or no longer operational");
  }
  if (
    local.context.task.taskTitle.trim().length === 0
    || local.context.task.rootTitle.trim().length === 0
    || local.context.task.taskTitle.length
      > TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1.maxTitleCharacters
    || local.context.task.rootTitle.length
      > TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1.maxTitleCharacters
  ) {
    fail("task or root title is not readable");
  }
  if (handoff.manifest.task.predecessors.some((row) => !terminalPredecessor(row))) {
    fail("task has a blocking nonterminal predecessor");
  }

  assertPlainObject(input.expectedProvenance, "expected provenance");
  assertExactKeys(input.expectedProvenance, [
    "sourceSnapshotDigest",
    "adapterVersion",
    "adapterPolicyDigest",
  ], "expected provenance");
  assertDigest(
    input.expectedProvenance.sourceSnapshotDigest,
    "expected provenance sourceSnapshotDigest",
  );
  assertVersion(
    input.expectedProvenance.adapterVersion,
    "expected provenance adapterVersion",
  );
  assertDigest(
    input.expectedProvenance.adapterPolicyDigest,
    "expected provenance adapterPolicyDigest",
  );
  const expectationDigest = taskMapContractDigest({
    domain: EXPECTED_PROVENANCE_DOMAIN,
    sourceSnapshotDigest: input.expectedProvenance.sourceSnapshotDigest,
    adapterVersion: input.expectedProvenance.adapterVersion,
    adapterPolicyDigest: input.expectedProvenance.adapterPolicyDigest,
  });
  assertPlainObject(input.expectedOperational, "expected operational inputs");
  assertExactKeys(input.expectedOperational, [
    "workspaceBindingDigest",
    "criteriaAssessmentDigest",
  ], "expected operational inputs");
  assertDigest(
    input.expectedOperational.workspaceBindingDigest,
    "expected operational workspaceBindingDigest",
  );
  assertDigest(
    input.expectedOperational.criteriaAssessmentDigest,
    "expected operational criteriaAssessmentDigest",
  );
  const operationalExpectationDigest = taskMapContractDigest({
    domain: EXPECTED_OPERATIONAL_DOMAIN,
    workspaceBindingDigest:
      input.expectedOperational.workspaceBindingDigest,
    criteriaAssessmentDigest:
      input.expectedOperational.criteriaAssessmentDigest,
  });
  const provenance = assertTaskMapExactProvenance(input.exactProvenance, {
    projection: local.projection,
    currentness: local.currentness,
    currentnessFileDigest: local.inspection.quartet.currentnessFileDigest,
    expectedSourceSnapshotDigest:
      input.expectedProvenance.sourceSnapshotDigest,
    expectedAdapterVersion: input.expectedProvenance.adapterVersion,
    expectedAdapterPolicyDigest:
      input.expectedProvenance.adapterPolicyDigest,
  });
  const taskProof = provenance.tasks.find(
    (row) => row.taskId === handoff.manifest.task.taskId,
  );
  const rootProof = provenance.roots.find(
    (row) => row.rootId === handoff.manifest.task.rootId,
  );
  if (
    taskProof === undefined
    || rootProof === undefined
    || !rootProof.currentTaskIds.includes(taskProof.taskId)
    || !rootProof.currentTaskProofDigests.includes(taskProof.proofDigest)
    || taskProof.pointerId !== local.context.task.taskHomePointerId
  ) {
    fail("selected task lacks exact task/root provenance");
  }
  const routeEdgeDerivationDigests = routeEdgeProofs(
    handoff.manifest,
    provenance,
    taskProof.proofDigest,
  );
  const contexts = versionedContext(local.context.sourceEvidence);
  const homeContext = contexts.versioned.find(
    (row) => row.pointerId === taskProof.pointerId,
  );
  if (
    homeContext === undefined
    || homeContext.sourceVersion !== taskProof.sourceRevision
  ) {
    fail("exact task source is absent from versioned context");
  }

  const workspaceBinding =
    assertTaskMapAgentWorkspaceBinding(input.workspaceBinding);
  if (
    workspaceBinding.bindingDigest
      !== input.expectedOperational.workspaceBindingDigest
  ) {
    fail("workspace binding does not match the external registry expectation");
  }
  const criteriaAssessment = assertTaskMapOperationalCriteriaAssessment(
    input.criteriaAssessment,
    {
      handoffManifestDigest: handoff.manifest.handoffManifestDigest,
      operationalContextDigest: local.context.contextDigest,
      exactProvenanceDigest: provenance.artifactDigest,
      workspaceBindingDigest: workspaceBinding.bindingDigest,
      workspaceRevisionDigest: workspaceBinding.workspaceRevisionDigest,
      currentWorkArtifactDigest:
        local.inspection.quartet.currentWorkArtifactDigest,
      taskId: handoff.manifest.task.taskId,
      rootId: handoff.manifest.task.rootId,
      doneDefinition: handoff.manifest.task.doneDefinition,
    },
  );
  if (
    criteriaAssessment.assessmentDigest
      !== input.expectedOperational.criteriaAssessmentDigest
  ) {
    fail("criteria assessment does not match the external checker expectation");
  }
  if (criteriaAssessment.criteria.some((row) => row.state === "unknown")) {
    fail("unfinishedness is unknown");
  }
  if (!criteriaAssessment.criteria.some((row) => row.state === "unmet")) {
    fail("task is already satisfied");
  }

  const sourceEvidenceDigest = taskMapContractDigest({
    domain: SOURCE_EVIDENCE_DOMAIN,
    expectationDigest,
    exactTaskProofDigest: taskProof.proofDigest,
    rootDerivationDigest: rootProof.derivationDigest,
    routeEdgeDerivationDigests,
    versionedContext: contexts.versioned,
    excludedUnversionedContextPointerIds: contexts.excluded,
  });
  const runtimeRequest = { ...handoff.manifest.runtimeRequest };
  const startIdempotencyKey = taskMapContractDigest({
    domain: START_IDEMPOTENCY_DOMAIN,
    handoffManifestDigest: handoff.manifest.handoffManifestDigest,
    operationalContextDigest: local.context.contextDigest,
    exactProvenanceDigest: provenance.artifactDigest,
    expectationDigest,
    operationalExpectationDigest,
    workspaceBindingDigest: workspaceBinding.bindingDigest,
    criteriaAssessmentDigest: criteriaAssessment.assessmentDigest,
    sourceEvidenceDigest,
    runtimeRequest,
    operation: "create_fresh_codex_task",
  });
  const core: Omit<
    TaskMapAgentHandoffPreflightV1,
    "preflightId" | "preflightDigest"
  > = {
    contractVersion: TASKMAP_AGENT_HANDOFF_PREFLIGHT_VERSION,
    handoffManifestDigest: handoff.manifest.handoffManifestDigest,
    operationalExpectationDigest,
    localOwnerScopeDigest: handoff.manifest.localOwnerScopeDigest,
    quartet: { ...handoff.manifest.quartet },
    task: {
      taskId: handoff.manifest.task.taskId,
      rootId: handoff.manifest.task.rootId,
      taskTitle: local.context.task.taskTitle,
      rootTitle: local.context.task.rootTitle,
      outcome: handoff.manifest.task.outcome,
      input: {
        ...handoff.manifest.task.input,
        contextPointerIds: [
          ...handoff.manifest.task.input.contextPointerIds,
        ],
      },
      predecessors: handoff.manifest.task.predecessors.map((row) => ({ ...row })),
      doneDefinition: [...handoff.manifest.task.doneDefinition],
      returnTarget: { ...handoff.manifest.task.returnTarget },
      routeNodeIds: [...handoff.manifest.task.routeNodeIds],
    },
    provenance: {
      artifactDigest: provenance.artifactDigest,
      producerVersion: provenance.producer.version,
      producerPolicyDigest: provenance.producer.policyDigest,
      expectationDigest,
      expectedSourceSnapshotDigest:
        input.expectedProvenance.sourceSnapshotDigest,
      expectedAdapterVersion: input.expectedProvenance.adapterVersion,
      expectedAdapterPolicyDigest:
        input.expectedProvenance.adapterPolicyDigest,
      taskProof: { ...taskProof },
      rootDerivationDigest: rootProof.derivationDigest,
      routeEdgeDerivationDigests,
      sourceEvidenceDigest,
      versionedContext: contexts.versioned,
      excludedUnversionedContextPointerIds: contexts.excluded,
    },
    workspaceBinding: cloneWorkspaceBinding(workspaceBinding),
    criteriaAssessment: {
      ...criteriaAssessment,
      criteria: criteriaAssessment.criteria.map((row) => ({ ...row })),
    },
    runtimeRequest,
    startIdempotencyKey,
    boundary: {
      state: "validated_not_started",
      humanApprovalRequired: true,
      dispatchAuthorized: false,
      processStartAuthorized: false,
      codexTaskStartAuthorized: false,
      taskCreated: false,
      codexTaskId: null,
      sourceWritebackAuthorized: false,
      sourceCompletionAuthorized: false,
      outcomeVerificationAuthorized: false,
    },
    privacy: {
      sourceRowsStored: false,
      sourceBodiesStored: false,
      localPathsStored: false,
      rawBiometricsStored: false,
      credentialsStored: false,
      participantIdentitiesStored: false,
      unboundedWorkspaceContextStored: false,
    },
  };
  const preflightDigest = taskMapAgentHandoffPreflightDigest(core);
  const preflight: TaskMapAgentHandoffPreflightV1 = {
    ...core,
    preflightId: `tmhandoffpreflight_${preflightDigest}`,
    preflightDigest,
  };
  if (taskMapProjectionPrivacyLeakReasons(preflight).length > 0) {
    fail("preflight violates the privacy boundary");
  }
  if (
    Buffer.byteLength(taskMapContractCanonicalJson(preflight), "utf8")
      > TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1.maxArtifactBytes
  ) {
    fail("preflight exceeds the byte limit");
  }
  return preflight;
}

export function buildTaskMapAgentHandoffPreflightSummary(
  preflight: TaskMapAgentHandoffPreflightV1,
  handoffManifest: TaskMapAgentHandoffManifestV1,
): TaskMapAgentHandoffPreflightSummaryV1 {
  assertPlainObject(preflight, "preflight summary source");
  assertExactKeys(preflight, [
    "contractVersion",
    "preflightId",
    "preflightDigest",
    "handoffManifestDigest",
    "operationalExpectationDigest",
    "localOwnerScopeDigest",
    "quartet",
    "task",
    "provenance",
    "workspaceBinding",
    "criteriaAssessment",
    "runtimeRequest",
    "startIdempotencyKey",
    "boundary",
    "privacy",
  ], "preflight summary source");
  assertDigest(preflight.preflightDigest, "preflight digest");
  if (
    preflight.contractVersion !== TASKMAP_AGENT_HANDOFF_PREFLIGHT_VERSION
    || PREFLIGHT_ID.exec(preflight.preflightId)?.[1]
      !== preflight.preflightDigest
  ) {
    fail("preflight summary source identity is invalid");
  }
  const {
    preflightId: _preflightId,
    preflightDigest: _preflightDigest,
    ...preflightCore
  } = preflight;
  if (
    taskMapAgentHandoffPreflightDigest(preflightCore)
      !== preflight.preflightDigest
  ) {
    fail("preflight summary source digest is invalid");
  }

  assertPlainObject(preflight.boundary, "preflight boundary");
  assertExactKeys(preflight.boundary, [
    "state",
    "humanApprovalRequired",
    "dispatchAuthorized",
    "processStartAuthorized",
    "codexTaskStartAuthorized",
    "taskCreated",
    "codexTaskId",
    "sourceWritebackAuthorized",
    "sourceCompletionAuthorized",
    "outcomeVerificationAuthorized",
  ], "preflight boundary");
  if (
    preflight.boundary.state !== "validated_not_started"
    || preflight.boundary.humanApprovalRequired !== true
    || preflight.boundary.dispatchAuthorized !== false
    || preflight.boundary.processStartAuthorized !== false
    || preflight.boundary.codexTaskStartAuthorized !== false
    || preflight.boundary.taskCreated !== false
    || preflight.boundary.codexTaskId !== null
    || preflight.boundary.sourceWritebackAuthorized !== false
    || preflight.boundary.sourceCompletionAuthorized !== false
    || preflight.boundary.outcomeVerificationAuthorized !== false
  ) {
    fail("preflight summary source is not safely unfinished");
  }

  assertPlainObject(handoffManifest, "preflight handoff manifest");
  assertExactKeys(handoffManifest, [
    "contractVersion",
    "handoffManifestId",
    "handoffManifestDigest",
    "localOwnerScopeDigest",
    "proofDigest",
    "preparation",
    "quartet",
    "task",
    "runtimeRequest",
    "routeIdempotencyKey",
    "dryRunReturnPlan",
    "boundary",
    "privacy",
  ], "preflight handoff manifest");
  assertDigest(
    handoffManifest.handoffManifestDigest,
    "handoff manifest digest",
  );
  if (
    handoffManifest.contractVersion !== "taskmap-agent-handoff-manifest.v1"
    || HANDOFF_MANIFEST_ID.exec(handoffManifest.handoffManifestId)?.[1]
      !== handoffManifest.handoffManifestDigest
    || handoffManifest.handoffManifestDigest
      !== preflight.handoffManifestDigest
    || handoffManifest.localOwnerScopeDigest
      !== preflight.localOwnerScopeDigest
  ) {
    fail("preflight and M4A handoff identities do not match");
  }
  const {
    handoffManifestId: _handoffManifestId,
    handoffManifestDigest: _handoffManifestDigest,
    ...handoffManifestCore
  } = handoffManifest;
  if (
    taskMapContractDigest({
      domain: HANDOFF_MANIFEST_DOMAIN,
      ...handoffManifestCore,
    }) !== handoffManifest.handoffManifestDigest
  ) {
    fail("M4A handoff manifest digest is invalid");
  }

  assertPlainObject(handoffManifest.boundary, "M4A handoff boundary");
  assertExactKeys(handoffManifest.boundary, [
    "state",
    "dispatchAuthorized",
    "processStartAuthorized",
    "codexTaskStartAuthorized",
    "taskCreated",
    "codexTaskId",
    "deliveryStatus",
    "returnActionExecutionAuthorized",
    "sourceCompletionAuthorized",
    "outcomeVerificationAuthorized",
  ], "M4A handoff boundary");
  if (
    handoffManifest.boundary.state !== "prepared_not_dispatched"
    || handoffManifest.boundary.dispatchAuthorized !== false
    || handoffManifest.boundary.processStartAuthorized !== false
    || handoffManifest.boundary.codexTaskStartAuthorized !== false
    || handoffManifest.boundary.taskCreated !== false
    || handoffManifest.boundary.codexTaskId !== null
    || handoffManifest.boundary.deliveryStatus !== "not_started"
    || handoffManifest.boundary.returnActionExecutionAuthorized !== false
    || handoffManifest.boundary.sourceCompletionAuthorized !== false
    || handoffManifest.boundary.outcomeVerificationAuthorized !== false
  ) {
    fail("M4A handoff is not safely prepared and unstarted");
  }
  assertPlainObject(
    handoffManifest.dryRunReturnPlan,
    "M4A dry-run return plan",
  );
  if (
    handoffManifest.dryRunReturnPlan.state !== "dry_run"
    || handoffManifest.dryRunReturnPlan.actions.length !== 0
    || handoffManifest.dryRunReturnPlan.aggregateStatus !== "not_started"
    || handoffManifest.dryRunReturnPlan.sourceMutationAuthorized !== false
  ) {
    fail("M4A return plan is not a non-mutating dry run");
  }

  assertPlainObject(
    handoffManifest.preparation,
    "preflight package binding",
  );
  assertExactKeys(handoffManifest.preparation, [
    "prepareIdempotencyKey",
    "approvalAuthorizationId",
    "approvalAuthorizationDigest",
    "packageId",
    "packageDigest",
    "preparationReceiptId",
    "preparationReceiptDigest",
  ], "preflight package binding");
  assertDigest(handoffManifest.preparation.packageDigest, "package digest");
  if (
    PACKAGE_ID.exec(handoffManifest.preparation.packageId)?.[1]
      !== handoffManifest.preparation.packageDigest
    || handoffManifest.task.taskId !== preflight.task.taskId
    || handoffManifest.task.rootId !== preflight.task.rootId
    || !sameCanonical(
      handoffManifest.runtimeRequest,
      preflight.runtimeRequest,
    )
  ) {
    fail("preflight package, task, or runtime binding is invalid");
  }

  const workspaceBinding =
    assertTaskMapAgentWorkspaceBinding(preflight.workspaceBinding);
  const criteriaAssessment = assertTaskMapOperationalCriteriaAssessment(
    preflight.criteriaAssessment,
    {
      handoffManifestDigest: preflight.handoffManifestDigest,
      operationalContextDigest:
        preflight.criteriaAssessment.operationalContextDigest,
      exactProvenanceDigest: preflight.provenance.artifactDigest,
      workspaceBindingDigest: workspaceBinding.bindingDigest,
      workspaceRevisionDigest: workspaceBinding.workspaceRevisionDigest,
      currentWorkArtifactDigest:
        preflight.criteriaAssessment.currentWorkArtifactDigest,
      taskId: preflight.task.taskId,
      rootId: preflight.task.rootId,
      doneDefinition: preflight.task.doneDefinition,
    },
  );
  const expectedStartIdempotencyKey = taskMapContractDigest({
    domain: START_IDEMPOTENCY_DOMAIN,
    handoffManifestDigest: preflight.handoffManifestDigest,
    operationalContextDigest: criteriaAssessment.operationalContextDigest,
    exactProvenanceDigest: preflight.provenance.artifactDigest,
    expectationDigest: preflight.provenance.expectationDigest,
    operationalExpectationDigest: preflight.operationalExpectationDigest,
    workspaceBindingDigest: workspaceBinding.bindingDigest,
    criteriaAssessmentDigest: criteriaAssessment.assessmentDigest,
    sourceEvidenceDigest: preflight.provenance.sourceEvidenceDigest,
    runtimeRequest: preflight.runtimeRequest,
    operation: "create_fresh_codex_task",
  });
  if (
    expectedStartIdempotencyKey !== preflight.startIdempotencyKey
    || criteriaAssessment.criteria.some((row) => row.state === "unknown")
    || !criteriaAssessment.criteria.some((row) => row.state === "unmet")
  ) {
    fail("preflight unfinishedness or start binding is invalid");
  }
  if (
    taskMapProjectionPrivacyLeakReasons(preflight).length > 0
    || taskMapProjectionPrivacyLeakReasons(handoffManifest).length > 0
  ) {
    fail("preflight summary source violates the privacy boundary");
  }

  const summary: TaskMapAgentHandoffPreflightSummaryV1 = {
    contractVersion: TASKMAP_AGENT_HANDOFF_PREFLIGHT_SUMMARY_VERSION,
    state: "validated_not_started",
    preflightId: preflight.preflightId,
    preflightDigest: preflight.preflightDigest,
    handoffManifestDigest: preflight.handoffManifestDigest,
    packageId: handoffManifest.preparation.packageId,
    packageDigest: handoffManifest.preparation.packageDigest,
    taskId: preflight.task.taskId,
    rootId: preflight.task.rootId,
    exactProvenanceDigest: preflight.provenance.artifactDigest,
    workspaceBindingDigest: workspaceBinding.bindingDigest,
    criteriaAssessmentDigest: criteriaAssessment.assessmentDigest,
    runtimeRequest: { ...preflight.runtimeRequest },
    startIdempotencyKey: preflight.startIdempotencyKey,
    taskCreated: false,
    codexTaskId: null,
    processStartAuthorized: false,
    codexTaskStartAuthorized: false,
    dispatchAuthorized: false,
    sourceWritebackAuthorized: false,
    returnActionsAuthorized: false,
    sourceCompletionAuthorized: false,
    outcomeVerificationAuthorized: false,
  };
  if (
    taskMapProjectionPrivacyLeakReasons(summary).length > 0
    || Buffer.byteLength(taskMapContractCanonicalJson(summary), "utf8")
      > TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1.maxSummaryBytes
  ) {
    fail("preflight summary violates its privacy or byte boundary");
  }
  return summary;
}

function taskMapAgentAdapterOperation(
  adapter: unknown,
): TaskMapAgentAdapterOperationV1 {
  if (adapter === "codex") return "create_fresh_codex_task";
  if (adapter === "claude_code") {
    return "create_fresh_claude_code_session";
  }
  fail("adapter must be codex or claude_code");
}

function taskMapAgentAdapterRuntimeRequestDigest(
  request: Omit<TaskMapAgentAdapterRuntimeRequestV1, "requestDigest">,
): string {
  return taskMapContractDigest({
    domain: ADAPTER_RUNTIME_REQUEST_DOMAIN,
    ...request,
  });
}

function taskMapAgentAdapterPreflightDigest(
  preflight: Omit<
    TaskMapAgentAdapterHandoffPreflightV1,
    "adapterPreflightId" | "adapterPreflightDigest"
  >,
): string {
  return taskMapContractDigest({
    domain: ADAPTER_PREFLIGHT_DOMAIN,
    ...preflight,
  });
}

export function assertTaskMapAgentAdapterHandoffPreflight(
  value: unknown,
): asserts value is TaskMapAgentAdapterHandoffPreflightV1 {
  assertPlainObject(value, "adapter preflight");
  assertExactKeys(value, [
    "contractVersion",
    "adapterPreflightId",
    "adapterPreflightDigest",
    "adapter",
    "packageId",
    "packageDigest",
    "corePreflightId",
    "corePreflightDigest",
    "taskId",
    "rootId",
    "workspaceBindingDigest",
    "runtimeRequest",
    "startIdempotencyKey",
    "boundary",
    "privacy",
  ], "adapter preflight");
  const candidate =
    value as unknown as TaskMapAgentAdapterHandoffPreflightV1;
  assertDigest(candidate.adapterPreflightDigest, "adapter preflight digest");
  assertDigest(candidate.packageDigest, "adapter package digest");
  assertDigest(candidate.corePreflightDigest, "core preflight digest");
  assertDigest(
    candidate.workspaceBindingDigest,
    "adapter workspace binding digest",
  );
  assertDigest(candidate.startIdempotencyKey, "adapter start idempotency key");
  if (
    candidate.contractVersion
      !== TASKMAP_AGENT_ADAPTER_HANDOFF_PREFLIGHT_VERSION
    || ADAPTER_PREFLIGHT_ID.exec(candidate.adapterPreflightId)?.[1]
      !== candidate.adapterPreflightDigest
    || PACKAGE_ID.exec(candidate.packageId)?.[1] !== candidate.packageDigest
    || PREFLIGHT_ID.exec(candidate.corePreflightId)?.[1]
      !== candidate.corePreflightDigest
    || !TASK_ID.test(candidate.taskId)
    || !ROOT_ID.test(candidate.rootId)
  ) {
    fail("adapter preflight identity or task binding is invalid");
  }

  assertPlainObject(candidate.runtimeRequest, "adapter runtime request");
  assertExactKeys(candidate.runtimeRequest, [
    "contractVersion",
    "adapter",
    "operation",
    "taskMode",
    "packageId",
    "packageDigest",
    "packagePayloadDigest",
    "corePreflightId",
    "corePreflightDigest",
    "taskId",
    "rootId",
    "workspaceBindingDigest",
    "requestDigest",
  ], "adapter runtime request");
  assertDigest(
    candidate.runtimeRequest.packagePayloadDigest,
    "adapter package payload digest",
  );
  assertDigest(candidate.runtimeRequest.requestDigest, "adapter request digest");
  const {
    requestDigest: _requestDigest,
    ...runtimeRequestCore
  } = candidate.runtimeRequest;
  if (
    candidate.runtimeRequest.contractVersion
      !== TASKMAP_AGENT_ADAPTER_RUNTIME_REQUEST_VERSION
    || candidate.runtimeRequest.adapter !== candidate.adapter
    || candidate.runtimeRequest.operation
      !== taskMapAgentAdapterOperation(candidate.adapter)
    || candidate.runtimeRequest.taskMode !== "fresh"
    || candidate.runtimeRequest.packageId !== candidate.packageId
    || candidate.runtimeRequest.packageDigest !== candidate.packageDigest
    || candidate.runtimeRequest.corePreflightId !== candidate.corePreflightId
    || candidate.runtimeRequest.corePreflightDigest
      !== candidate.corePreflightDigest
    || candidate.runtimeRequest.taskId !== candidate.taskId
    || candidate.runtimeRequest.rootId !== candidate.rootId
    || candidate.runtimeRequest.workspaceBindingDigest
      !== candidate.workspaceBindingDigest
    || taskMapAgentAdapterRuntimeRequestDigest(runtimeRequestCore)
      !== candidate.runtimeRequest.requestDigest
  ) {
    fail("adapter runtime request binding is invalid");
  }

  assertPlainObject(candidate.boundary, "adapter preflight boundary");
  assertExactKeys(candidate.boundary, [
    "state",
    "humanApprovalRequired",
    "dispatchAuthorized",
    "processStartAuthorized",
    "adapterSessionStartAuthorized",
    "taskCreated",
    "adapterSessionId",
    "sourceWritebackAuthorized",
    "sourceCompletionAuthorized",
    "outcomeVerificationAuthorized",
  ], "adapter preflight boundary");
  if (
    candidate.boundary.state !== "validated_not_started"
    || candidate.boundary.humanApprovalRequired !== true
    || candidate.boundary.dispatchAuthorized !== false
    || candidate.boundary.processStartAuthorized !== false
    || candidate.boundary.adapterSessionStartAuthorized !== false
    || candidate.boundary.taskCreated !== false
    || candidate.boundary.adapterSessionId !== null
    || candidate.boundary.sourceWritebackAuthorized !== false
    || candidate.boundary.sourceCompletionAuthorized !== false
    || candidate.boundary.outcomeVerificationAuthorized !== false
  ) {
    fail("adapter preflight is not safely unstarted");
  }

  assertPlainObject(candidate.privacy, "adapter preflight privacy");
  assertExactKeys(candidate.privacy, [
    "sourceBodiesStored",
    "localPathsStored",
    "credentialsStored",
    "participantIdentitiesStored",
    "unboundedWorkspaceContextStored",
  ], "adapter preflight privacy");
  if (Object.values(candidate.privacy).some((stored) => stored !== false)) {
    fail("adapter preflight privacy boundary is invalid");
  }

  const {
    adapterPreflightId: _adapterPreflightId,
    adapterPreflightDigest: _adapterPreflightDigest,
    ...preflightCore
  } = candidate;
  const expectedStartIdempotencyKey = taskMapContractDigest({
    domain: ADAPTER_START_IDEMPOTENCY_DOMAIN,
    adapter: candidate.adapter,
    packageDigest: candidate.packageDigest,
    corePreflightDigest: candidate.corePreflightDigest,
    requestDigest: candidate.runtimeRequest.requestDigest,
  });
  if (
    taskMapAgentAdapterPreflightDigest(preflightCore)
      !== candidate.adapterPreflightDigest
    || expectedStartIdempotencyKey !== candidate.startIdempotencyKey
    || taskMapProjectionPrivacyLeakReasons(candidate).length > 0
    || Buffer.byteLength(taskMapContractCanonicalJson(candidate), "utf8")
      > TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1.maxArtifactBytes
  ) {
    fail("adapter preflight digest, privacy, or byte boundary is invalid");
  }
}

export async function inspectTaskMapAgentAdapterHandoffPreflight(
  input: InspectTaskMapAgentAdapterHandoffPreflightInputV1,
): Promise<TaskMapAgentAdapterHandoffPreflightV1> {
  assertPlainObject(input, "adapter preflight input");
  assertExactKeys(
    input,
    ["adapter", "preflightInput"],
    "adapter preflight input",
  );

  // Validate owner, package, provenance, route, currentness, and unfinishedness
  // before the caller-selected adapter can influence any derived request.
  const corePreflight =
    await inspectTaskMapAgentHandoffPreflight(input.preflightInput);
  const handoffInput: InspectTaskMapLocalApprovalInputV1 = {
    taskMapRoot: input.preflightInput.taskMapRoot,
    ownerRoot: input.preflightInput.ownerRoot,
    ...(input.preflightInput.expectedOwnerScopeDigest === undefined
      ? {}
      : {
        expectedOwnerScopeDigest:
          input.preflightInput.expectedOwnerScopeDigest,
      }),
    ...(input.preflightInput.taskId === undefined
      ? {} : { taskId: input.preflightInput.taskId }),
  };
  const handoff = await inspectTaskMapAgentHandoff(handoffInput);
  const summary = buildTaskMapAgentHandoffPreflightSummary(
    corePreflight,
    handoff.manifest,
  );
  const operation = taskMapAgentAdapterOperation(input.adapter);
  const packagePayloadDigest = taskMapContractDigest({
    packageId: summary.packageId,
    packageDigest: summary.packageDigest,
    corePreflightDigest: corePreflight.preflightDigest,
    taskId: corePreflight.task.taskId,
    rootId: corePreflight.task.rootId,
    taskInput: corePreflight.task.input,
    outcome: corePreflight.task.outcome,
    doneDefinition: corePreflight.task.doneDefinition,
    returnTarget: corePreflight.task.returnTarget,
    exactProvenanceDigest: corePreflight.provenance.artifactDigest,
    workspaceBindingDigest: corePreflight.workspaceBinding.bindingDigest,
    criteriaAssessmentDigest:
      corePreflight.criteriaAssessment.assessmentDigest,
  });
  const runtimeRequestCore: Omit<
    TaskMapAgentAdapterRuntimeRequestV1,
    "requestDigest"
  > = {
    contractVersion: TASKMAP_AGENT_ADAPTER_RUNTIME_REQUEST_VERSION,
    adapter: input.adapter,
    operation,
    taskMode: "fresh",
    packageId: summary.packageId,
    packageDigest: summary.packageDigest,
    packagePayloadDigest,
    corePreflightId: corePreflight.preflightId,
    corePreflightDigest: corePreflight.preflightDigest,
    taskId: corePreflight.task.taskId,
    rootId: corePreflight.task.rootId,
    workspaceBindingDigest: corePreflight.workspaceBinding.bindingDigest,
  };
  const runtimeRequest: TaskMapAgentAdapterRuntimeRequestV1 = {
    ...runtimeRequestCore,
    requestDigest:
      taskMapAgentAdapterRuntimeRequestDigest(runtimeRequestCore),
  };
  const startIdempotencyKey = taskMapContractDigest({
    domain: ADAPTER_START_IDEMPOTENCY_DOMAIN,
    adapter: input.adapter,
    packageDigest: summary.packageDigest,
    corePreflightDigest: corePreflight.preflightDigest,
    requestDigest: runtimeRequest.requestDigest,
  });
  const core: Omit<
    TaskMapAgentAdapterHandoffPreflightV1,
    "adapterPreflightId" | "adapterPreflightDigest"
  > = {
    contractVersion: TASKMAP_AGENT_ADAPTER_HANDOFF_PREFLIGHT_VERSION,
    adapter: input.adapter,
    packageId: summary.packageId,
    packageDigest: summary.packageDigest,
    corePreflightId: corePreflight.preflightId,
    corePreflightDigest: corePreflight.preflightDigest,
    taskId: corePreflight.task.taskId,
    rootId: corePreflight.task.rootId,
    workspaceBindingDigest: corePreflight.workspaceBinding.bindingDigest,
    runtimeRequest,
    startIdempotencyKey,
    boundary: {
      state: "validated_not_started",
      humanApprovalRequired: true,
      dispatchAuthorized: false,
      processStartAuthorized: false,
      adapterSessionStartAuthorized: false,
      taskCreated: false,
      adapterSessionId: null,
      sourceWritebackAuthorized: false,
      sourceCompletionAuthorized: false,
      outcomeVerificationAuthorized: false,
    },
    privacy: {
      sourceBodiesStored: false,
      localPathsStored: false,
      credentialsStored: false,
      participantIdentitiesStored: false,
      unboundedWorkspaceContextStored: false,
    },
  };
  const adapterPreflightDigest = taskMapAgentAdapterPreflightDigest(core);
  const result: TaskMapAgentAdapterHandoffPreflightV1 = {
    ...core,
    adapterPreflightId:
      `tmadapterpreflight_${adapterPreflightDigest}`,
    adapterPreflightDigest,
  };
  assertTaskMapAgentAdapterHandoffPreflight(result);
  return result;
}

async function loadAdoptedStrategySourceEvidence(
  taskMapRoot: string,
): Promise<TaskMapSourceSnapshotV1> {
  const artifactPath = path.join(
    taskMapRoot,
    TASKMAP_STRATEGY_SOURCE_EVIDENCE_FILENAME,
  );
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(
      artifactPath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
    const metadata = await handle.stat();
    const owner = process.getuid?.();
    if (
      !metadata.isFile()
      || metadata.isSymbolicLink()
      || metadata.size <= 0
      || metadata.size > 256 * 1_024
      || (owner !== undefined && metadata.uid !== owner)
      || (metadata.mode & 0o077) !== 0
    ) {
      fail("Strategy source evidence is not one owner-private regular file");
    }
    const text = await handle.readFile({ encoding: "utf8" });
    const value = JSON.parse(text) as TaskMapSourceSnapshotV1;
    const canonical = taskMapContractCanonicalJson(value);
    if (text !== canonical && text !== canonical + "\n") {
      fail("Strategy source evidence is not canonical JSON");
    }
    return assertTaskMapSourceSnapshot(value);
  } catch (error) {
    if (
      error instanceof Error
      && error.message.startsWith("Task Map agent handoff preflight unavailable:")
    ) throw error;
    fail("Strategy source evidence is unavailable");
  } finally {
    await handle?.close();
  }
  fail("Strategy source evidence is unavailable");
}

function immutableStrategyRepositoryPath(
  canonicalUrl: string | undefined,
  revision: string,
): string | null {
  if (canonicalUrl === undefined
    || revision.length !== 40
    || [...revision].some((character) =>
      !"0123456789abcdef".includes(character)
    )) {
    return null;
  }
  try {
    const url = new URL(canonicalUrl);
    const segments = decodeURIComponent(url.pathname)
      .split("/")
      .filter(Boolean);
    const repositoryRelativePath = segments.slice(4).join("/");
    return url.protocol === "https:"
        && url.hostname === "github.com"
        && url.port === ""
        && url.username === ""
        && url.password === ""
        && url.search === ""
        && url.hash === ""
        && segments.length >= 5
        && segments[2] === "blob"
        && segments[3] === revision
        && repositoryRelativePath.length > 0
      ? repositoryRelativePath
      : null;
  } catch {
    return null;
  }
}

export interface InspectTaskMapAdoptedAgentAdapterPreflightInputV1 {
  adapter: TaskMapAgentHandoffAdapterV1;
  taskMapRoot: string;
  ownerRoot: string;
  expectedCandidateOwnerScopeDigest: string;
  taskId: string;
  workspaceBinding: TaskMapAgentWorkspaceBindingV1;
}

const ADOPTED_AGENT_RECEIPT_ADAPTER_VERSION =
  "taskmap-owner-receipt-adapter.1" as const;
const ADOPTED_AGENT_RECEIPT_LOCATOR =
  "owner-receipts/native-candidate-acceptance.v1.json" as const;

/**
 * Build one adapter proof from the exact post-approval owner state.
 *
 * The selected adopted task remains closed to its durable manual receipt. All
 * other current tasks must independently resolve to an exact supported source
 * envelope; unrelated source work cannot weaken the selected task proof.
 */
export async function inspectTaskMapAdoptedAgentAdapterPreflight(
  input: InspectTaskMapAdoptedAgentAdapterPreflightInputV1,
): Promise<TaskMapAgentAdapterHandoffPreflightV1> {
  assertPlainObject(input, "adopted agent adapter preflight input");
  assertExactKeys(input, [
    "adapter",
    "taskMapRoot",
    "ownerRoot",
    "expectedCandidateOwnerScopeDigest",
    "taskId",
    "workspaceBinding",
  ], "adopted agent adapter preflight input");
  assertDigest(
    input.expectedCandidateOwnerScopeDigest,
    "candidate owner scope digest",
  );
  const workspaceBinding = assertTaskMapAgentWorkspaceBinding(
    input.workspaceBinding,
  );
  const localInput: InspectTaskMapLocalApprovalInputV1 = {
    taskMapRoot: input.taskMapRoot,
    ownerRoot: input.ownerRoot,
    taskId: input.taskId,
  };
  const local = await inspectTaskMapLocalApprovalOperationalContext(
    localInput,
  );
  if (
    local.response.status !== "package_ready"
    || local.response.packageId === null
    || local.response.packageDigest === null
    || local.agentSessionEpisode === null
    || local.agentSessionTaskProof === null
    || local.agentSessionEpisode.routingIdentityDigest
      !== workspaceBinding.repositoryIdentityDigest
  ) {
    fail("adopted agent package or workspace binding is unavailable");
  }
  const homePointerId = local.context.task.taskHomePointerId;
  const homeEvidence = local.context.sourceEvidence.filter(
    (row) => row.pointerId === homePointerId && row.roles.includes("task_home"),
  );
  if (
    homeEvidence.length !== 1
    || homeEvidence[0]!.sourceKind !== "manual"
    || homeEvidence[0]!.authority !== "user"
    || homeEvidence[0]!.syncMode !== "personal_fork"
    || homeEvidence[0]!.sourceVersion === null
    || !DIGEST.test(homeEvidence[0]!.sourceVersion)
    || !homeEvidence[0]!.capabilities.includes("read_task")
  ) {
    fail("task is not a receipt-backed manual authority record");
  }
  const acceptanceStore = await loadTaskMapNativeCandidateAcceptanceStore({
    storePath: path.join(
      input.taskMapRoot,
      "native-candidate-acceptance.v1.json",
    ),
    expectedOwnerScopeDigest: input.expectedCandidateOwnerScopeDigest,
  });
  const matchingReceipts = acceptanceStore?.receipts.filter(
    (receipt) => (
      receipt.promotionId === homePointerId
      && receipt.promotionDigest === homeEvidence[0]!.sourceVersion
      && receipt.authority.sourceKind === "manual"
      && receipt.authority.authority === "user"
      && receipt.authority.syncMode === "personal_fork"
      && receipt.authority.recordKind === "authoritative_task"
      && receipt.sourceWritebackAttempted === false
    ),
  ) ?? [];
  if (matchingReceipts.length !== 1) {
    fail("durable adopted-agent receipt is unavailable or ambiguous");
  }
  const receipt = matchingReceipts[0]!;
  const taskProof = local.agentSessionTaskProof!;
  if (
    taskProof.taskId !== local.inspection.task.taskId
    || taskProof.promotionId !== receipt.promotionId
    || taskProof.promotionDigest !== receipt.promotionDigest
    || taskProof.candidateId !== receipt.candidateId
    || taskProof.candidateRevisionDigest !== receipt.candidateRevisionDigest
    || !sameCanonical(
      taskProof.evidenceProofDigests,
      receipt.evidenceProofDigests,
    )
    || !receipt.evidenceProofDigests.includes(
      taskProof.supportEvidenceProofDigest,
    )
    || !sameCanonical(taskProof.episode, local.agentSessionEpisode)
  ) {
    fail("selected adopted-agent proof does not match the durable receipt");
  }
  const adapterPolicyDigest = taskMapContractDigest({
    adapterVersion: ADOPTED_AGENT_RECEIPT_ADAPTER_VERSION,
    policy: "durable-owner-receipt-store-v1",
  });
  const currentTaskIds = local.currentness.taskDispositions
    .filter((row) => row.disposition === "current")
    .map((row) => row.taskId)
    .sort();
  const currentTasks = currentTaskIds.map((taskId) => {
    const task = local.projection.tasks.find((row) => row.id === taskId);
    const pointerId = task?.taskHomePointerId;
    const source = pointerId === undefined ? undefined
      : local.projection.sources.find((row) => row.id === pointerId);
    if (task === undefined || pointerId === undefined || source === undefined) {
      fail("current task lacks one exact source authority row");
    }
    return { taskId, task, pointerId, source };
  });
  const strategyEvidence = currentTasks.some((row) =>
      row.source.sourceKind === "strategy"
    )
    ? await loadAdoptedStrategySourceEvidence(input.taskMapRoot)
    : null;
  const provenanceRows = currentTasks.map((row) => {
    if (
      row.source.sourceKind === "manual"
      && row.source.authority === "user"
      && row.source.syncMode === "personal_fork"
    ) {
      const taskReceipts = acceptanceStore?.receipts.filter((candidate) =>
        candidate.promotionId === row.pointerId
        && candidate.promotionDigest === row.source.sourceVersion
      ) ?? [];
      if (taskReceipts.length !== 1) {
        fail("current manual task lacks one durable owner-receipt provenance row");
      }
      const taskReceipt = taskReceipts[0]!;
      const taskEnvelope = buildTaskMapSourceEnvelope({
        ownerScopeDigest: input.expectedCandidateOwnerScopeDigest,
        binding: {
          connectionId: "owner-receipt",
          sourceKind: "manual",
          tenantOrWorkspaceDigest: taskMapContractDigest({
            domain: "taskmap-owner-receipt-store.1",
            ownerScopeDigest: input.expectedCandidateOwnerScopeDigest,
          }),
          accountOrPrincipalDigest: input.expectedCandidateOwnerScopeDigest,
          grantVersion: "owner-confirmed-receipt-v1",
        },
        sourceKind: "manual",
        objectType: "authoritative_task",
        sourceObjectId: taskReceipt.promotionId,
        sourceRevision: taskReceipt.promotionDigest,
        eventTime: taskReceipt.confirmedAt,
        contentDigest: taskReceipt.promotionDigest,
        authority: {
          evidence: "authoritative_task",
          quality: "source_native",
          lifecycle: "explicit_user_policy",
          completion: "explicit_user_policy",
          rank: "accepted_work",
        },
      });
      return {
        taskId: row.taskId,
        taskEnvelope,
        repositoryRelativePath: ADOPTED_AGENT_RECEIPT_LOCATOR,
        adapterVersion: ADOPTED_AGENT_RECEIPT_ADAPTER_VERSION,
        adapterPolicyDigest,
      };
    }
    const repositoryRelativePath = row.source.sourceKind === "strategy"
      ? immutableStrategyRepositoryPath(
          row.source.canonicalUrl,
          row.source.sourceVersion ?? "",
        )
      : null;
    const strategyEnvelopes = repositoryRelativePath === null
      ? []
      : strategyEvidence?.envelopes.filter((envelope) =>
          envelope.ownerScopeDigest === input.expectedCandidateOwnerScopeDigest
          && envelope.sourceKind === "strategy"
          && envelope.objectType === "authoritative_task"
          && envelope.sourceObjectId === row.pointerId
          && envelope.sourceRevision === row.source.sourceVersion
          && envelope.binding.sourceKind === "strategy"
        ) ?? [];
    if (
      row.task.reviewState !== "accepted"
      || row.task.authority !== "source_system"
      || row.source.sourceKind !== "strategy"
      || row.source.authority !== "source_system"
      || row.source.syncMode !== "return_only"
      || !row.source.capabilities.includes("read_task")
    ) {
      fail("current Strategy task authority is unsupported");
    }
    if (repositoryRelativePath === null) {
      fail("current Strategy task lacks one immutable Git locator");
    }
    if (strategyEnvelopes.length !== 1) {
      fail("current Strategy task lacks one exact source evidence row");
    }
    return {
      taskId: row.taskId,
      taskEnvelope: structuredClone(strategyEnvelopes[0]!),
      repositoryRelativePath,
      adapterVersion: TASKMAP_STRATEGY_SOURCE_ADAPTER_VERSION,
      adapterPolicyDigest: TASKMAP_STRATEGY_SOURCE_ADAPTER_POLICY_DIGEST,
    };
  });
  const sourceSnapshot = buildTaskMapSourceSnapshot(
    provenanceRows.map((row) => row.taskEnvelope),
    [],
  );
  const taskBindings = provenanceRows.map((row) => ({
    taskId: row.taskId,
    sourceEnvelopeId: row.taskEnvelope.envelopeId,
    repositoryRelativePath: row.repositoryRelativePath,
    adapterVersion: row.adapterVersion,
    adapterPolicyDigest: row.adapterPolicyDigest,
  }));
  const adapterExpectation = taskMapExactProvenanceAdapterExpectation(
    taskBindings,
  );
  const provenance = buildTaskMapExactProvenance({
    projection: local.projection,
    currentness: local.currentness,
    currentnessFileDigest: local.inspection.quartet.currentnessFileDigest,
    expectedSourceSnapshotDigest: sourceSnapshot.sourceSnapshotDigest,
    expectedAdapterVersion: adapterExpectation.adapterVersion,
    expectedAdapterPolicyDigest: adapterExpectation.adapterPolicyDigest,
    sourceSnapshot,
    taskBindings,
  });
  const handoff = await inspectTaskMapAgentHandoff(localInput);
  const criteriaAssessment = buildTaskMapOperationalCriteriaAssessment({
    handoffManifestDigest: handoff.manifest.handoffManifestDigest,
    operationalContextDigest: local.context.contextDigest,
    exactProvenanceDigest: provenance.artifactDigest,
    workspaceBindingDigest: workspaceBinding.bindingDigest,
    workspaceRevisionDigest: workspaceBinding.workspaceRevisionDigest,
    currentWorkArtifactDigest:
      local.inspection.quartet.currentWorkArtifactDigest,
    taskId: local.inspection.task.taskId,
    rootId: local.inspection.task.rootId,
    doneDefinition: handoff.manifest.task.doneDefinition,
    criteria: handoff.manifest.task.doneDefinition.map(
      (_criterion, criterionIndex) => ({
        criterionIndex,
        state: "unmet" as const,
        evidenceDigest: taskMapContractDigest({
          domain: "taskmap-adopted-agent-unmet-criterion.1",
          criterionIndex,
          taskId: local.inspection.task.taskId,
          proofDigest: local.inspection.proofDigest,
          promotionDigest: receipt.promotionDigest,
          workspaceRevisionDigest: workspaceBinding.workspaceRevisionDigest,
        }),
      }),
    ),
  });
  return inspectTaskMapAgentAdapterHandoffPreflight({
    adapter: input.adapter,
    preflightInput: {
      ...localInput,
      exactProvenance: provenance,
      expectedProvenance: {
        sourceSnapshotDigest: sourceSnapshot.sourceSnapshotDigest,
        adapterVersion: adapterExpectation.adapterVersion,
        adapterPolicyDigest: adapterExpectation.adapterPolicyDigest,
      },
      expectedOperational: {
        workspaceBindingDigest: workspaceBinding.bindingDigest,
        criteriaAssessmentDigest: criteriaAssessment.assessmentDigest,
      },
      workspaceBinding,
      criteriaAssessment,
    },
  });
}
