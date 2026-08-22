import { taskMapProjectionPrivacyLeakReasons } from "./harness.js";
import {
  inspectTaskMapLocalApproval,
  TASKMAP_LOCAL_APPROVAL_LIMITS_V1,
  type InspectTaskMapLocalApprovalInputV1,
  type TaskMapLocalApprovalTaskV1,
  type TaskMapLocalQuartetBindingV1,
} from "./local-approval-package.js";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";

export const TASKMAP_AGENT_HANDOFF_MANIFEST_VERSION =
  "taskmap-agent-handoff-manifest.v1" as const;
export const TASKMAP_AGENT_HANDOFF_SUMMARY_VERSION =
  "taskmap-agent-handoff-summary.v1" as const;
export const TASKMAP_DRY_RUN_RETURN_PLAN_VERSION =
  "taskmap-dry-run-return-plan.v1" as const;

export const TASKMAP_AGENT_HANDOFF_LIMITS_V1 = Object.freeze({
  maxManifestBytes: TASKMAP_LOCAL_APPROVAL_LIMITS_V1.maxArtifactBytes,
  maxSummaryBytes: 16 * 1024,
} as const);

const AUTHORIZATION_ID = /^tmauthorization_([a-f0-9]{64})$/;
const PACKAGE_ID = /^tmlocalpackage_([a-f0-9]{64})$/;
const PREPARATION_RECEIPT_ID = /^tmpreparationreceipt_([a-f0-9]{64})$/;
const RETURN_PLAN_DOMAIN = "taskmap-dry-run-return-plan.1";
const ROUTE_IDEMPOTENCY_DOMAIN = "taskmap-codex-route-idempotency.1";
const MANIFEST_DOMAIN = "taskmap-agent-handoff-manifest.1";

export interface TaskMapAgentHandoffRuntimeRequestV1 {
  adapter: "codex_task";
  taskMode: "fresh";
  model: "gpt-5.6-sol";
  reasoningEffort: "ultra";
  serviceTier: "priority";
  fastMode: true;
}

export interface TaskMapDryRunReturnPlanV1 {
  contractVersion: typeof TASKMAP_DRY_RUN_RETURN_PLAN_VERSION;
  returnPlanId: string;
  returnPlanDigest: string;
  state: "dry_run";
  primaryTarget: TaskMapLocalApprovalTaskV1["returnTarget"];
  actions: [];
  perActionApprovalRequired: true;
  sourceVersionCheckRequired: true;
  outboxRequiredBeforeMutation: true;
  aggregateStatus: "not_started";
  sourceMutationAuthorized: false;
}

export interface TaskMapAgentHandoffManifestV1 {
  contractVersion: typeof TASKMAP_AGENT_HANDOFF_MANIFEST_VERSION;
  handoffManifestId: string;
  handoffManifestDigest: string;
  localOwnerScopeDigest: string;
  proofDigest: string;
  preparation: {
    prepareIdempotencyKey: string;
    approvalAuthorizationId: string;
    approvalAuthorizationDigest: string;
    packageId: string;
    packageDigest: string;
    preparationReceiptId: string;
    preparationReceiptDigest: string;
  };
  quartet: TaskMapLocalQuartetBindingV1;
  task: TaskMapLocalApprovalTaskV1;
  runtimeRequest: TaskMapAgentHandoffRuntimeRequestV1;
  routeIdempotencyKey: string;
  dryRunReturnPlan: TaskMapDryRunReturnPlanV1;
  boundary: {
    state: "prepared_not_dispatched";
    dispatchAuthorized: false;
    processStartAuthorized: false;
    codexTaskStartAuthorized: false;
    taskCreated: false;
    codexTaskId: null;
    deliveryStatus: "not_started";
    returnActionExecutionAuthorized: false;
    sourceCompletionAuthorized: false;
    outcomeVerificationAuthorized: false;
  };
  privacy: {
    sourceBodiesStored: false;
    localPathsStored: false;
    rawBiometricsStored: false;
    ownerIdentityStored: false;
    credentialsStored: false;
    participantIdentitiesStored: false;
    unboundedWorkspaceContextStored: false;
  };
}

export interface TaskMapAgentHandoffSummaryV1 {
  contractVersion: typeof TASKMAP_AGENT_HANDOFF_SUMMARY_VERSION;
  status: "handoff_ready";
  handoffManifestId: string;
  handoffManifestDigest: string;
  boundPackageDigest: string;
  routeIdempotencyKey: string;
  runtimeRequest: TaskMapAgentHandoffRuntimeRequestV1;
  returnPlan: {
    mode: "dry_run_only";
    returnActionsAuthorized: false;
    sourceWritebackAuthorized: false;
  };
  codexTaskCreated: false;
  codexTaskId: null;
  codexTaskStartAuthorized: false;
  dispatchAuthorized: false;
}

export interface TaskMapAgentHandoffInspectionV1 {
  manifest: TaskMapAgentHandoffManifestV1;
  summary: TaskMapAgentHandoffSummaryV1;
}

export type InspectTaskMapAgentHandoffInputV1 =
  InspectTaskMapLocalApprovalInputV1;

export const TASKMAP_AGENT_HANDOFF_RUNTIME_REQUEST_V1 =
  Object.freeze<TaskMapAgentHandoffRuntimeRequestV1>({
    adapter: "codex_task",
    taskMode: "fresh",
    model: "gpt-5.6-sol",
    reasoningEffort: "ultra",
    serviceTier: "priority",
    fastMode: true,
  });

function fail(message: string): never {
  throw new Error(`Task Map agent handoff unavailable: ${message}`);
}

function assertBoundDigestId(
  id: string,
  digest: string,
  pattern: RegExp,
  label: string,
): void {
  if (pattern.exec(id)?.[1] !== digest) {
    fail(`${label} does not match its digest`);
  }
}

function buildDryRunReturnPlan(
  primaryTarget: TaskMapLocalApprovalTaskV1["returnTarget"],
): TaskMapDryRunReturnPlanV1 {
  const core = {
    contractVersion: TASKMAP_DRY_RUN_RETURN_PLAN_VERSION,
    state: "dry_run" as const,
    primaryTarget: { ...primaryTarget },
    actions: [] as [],
    perActionApprovalRequired: true as const,
    sourceVersionCheckRequired: true as const,
    outboxRequiredBeforeMutation: true as const,
    aggregateStatus: "not_started" as const,
    sourceMutationAuthorized: false as const,
  };
  const returnPlanDigest = taskMapContractDigest({
    domain: RETURN_PLAN_DOMAIN,
    ...core,
  });
  return {
    ...core,
    returnPlanId: `tmreturnplan_${returnPlanDigest}`,
    returnPlanDigest,
  };
}

function buildSummary(
  manifest: TaskMapAgentHandoffManifestV1,
): TaskMapAgentHandoffSummaryV1 {
  const summary: TaskMapAgentHandoffSummaryV1 = {
    contractVersion: TASKMAP_AGENT_HANDOFF_SUMMARY_VERSION,
    status: "handoff_ready",
    handoffManifestId: manifest.handoffManifestId,
    handoffManifestDigest: manifest.handoffManifestDigest,
    boundPackageDigest: manifest.preparation.packageDigest,
    routeIdempotencyKey: manifest.routeIdempotencyKey,
    runtimeRequest: { ...manifest.runtimeRequest },
    returnPlan: {
      mode: "dry_run_only",
      returnActionsAuthorized: false,
      sourceWritebackAuthorized: false,
    },
    codexTaskCreated: false,
    codexTaskId: null,
    codexTaskStartAuthorized: false,
    dispatchAuthorized: false,
  };
  if (
    Buffer.byteLength(taskMapContractCanonicalJson(summary), "utf8")
    > TASKMAP_AGENT_HANDOFF_LIMITS_V1.maxSummaryBytes
  ) {
    fail("handoff summary exceeds the byte limit");
  }
  return summary;
}

export async function inspectTaskMapAgentHandoff(
  input: InspectTaskMapAgentHandoffInputV1,
): Promise<TaskMapAgentHandoffInspectionV1> {
  const { inspection, response } = await inspectTaskMapLocalApproval(input);
  if (
    response.status !== "package_ready"
    || response.approvalRecorded !== true
    || response.approvalAuthorizationId === null
    || response.approvalAuthorizationDigest === null
    || response.packageId === null
    || response.packageDigest === null
    || response.preparationReceiptId === null
    || response.deliveryStatus !== "not_started"
    || response.taskStarted !== false
    || response.noDispatch !== true
    || response.sourceCompletion !== false
    || response.outcomeVerified !== false
  ) {
    fail("the exact M3 package is not ready");
  }
  if (
    response.taskId !== inspection.task.taskId
    || response.rootId !== inspection.task.rootId
    || response.runId !== inspection.quartet.runId
    || response.localOwnerScopeDigest !== inspection.localOwnerScopeDigest
    || response.prepareIdempotencyKey !== inspection.prepareIdempotencyKey
    || response.proofDigest !== inspection.proofDigest
    || response.projectionFileDigest !== inspection.quartet.projectionFileDigest
    || response.currentnessFileDigest !== inspection.quartet.currentnessFileDigest
    || response.currentWorkFileDigest !== inspection.quartet.currentWorkFileDigest
    || response.bodyFileDigest !== inspection.quartet.bodyFileDigest
    || inspection.dispatchAuthorized !== false
    || inspection.sourceWritebackAuthorized !== false
    || inspection.codexTaskStartAuthorized !== false
    || inspection.sourceCompletionAuthorized !== false
    || inspection.outcomeVerificationAuthorized !== false
  ) {
    fail("the prepared response does not match the current inspection");
  }

  assertBoundDigestId(
    response.approvalAuthorizationId,
    response.approvalAuthorizationDigest,
    AUTHORIZATION_ID,
    "approval authorization id",
  );
  assertBoundDigestId(
    response.packageId,
    response.packageDigest,
    PACKAGE_ID,
    "package id",
  );
  const preparationReceiptDigest =
    PREPARATION_RECEIPT_ID.exec(response.preparationReceiptId)?.[1];
  if (preparationReceiptDigest === undefined) {
    fail("preparation receipt id is invalid");
  }

  const runtimeRequest = { ...TASKMAP_AGENT_HANDOFF_RUNTIME_REQUEST_V1 };
  const dryRunReturnPlan = buildDryRunReturnPlan(inspection.task.returnTarget);
  const routeIdempotencyKey = taskMapContractDigest({
    domain: ROUTE_IDEMPOTENCY_DOMAIN,
    localOwnerScopeDigest: inspection.localOwnerScopeDigest,
    proofDigest: inspection.proofDigest,
    packageDigest: response.packageDigest,
    runtimeRequest,
    returnPlanDigest: dryRunReturnPlan.returnPlanDigest,
    operation: "create_fresh_codex_task",
  });
  const core = {
    contractVersion: TASKMAP_AGENT_HANDOFF_MANIFEST_VERSION,
    localOwnerScopeDigest: inspection.localOwnerScopeDigest,
    proofDigest: inspection.proofDigest,
    preparation: {
      prepareIdempotencyKey: inspection.prepareIdempotencyKey,
      approvalAuthorizationId: response.approvalAuthorizationId,
      approvalAuthorizationDigest: response.approvalAuthorizationDigest,
      packageId: response.packageId,
      packageDigest: response.packageDigest,
      preparationReceiptId: response.preparationReceiptId,
      preparationReceiptDigest,
    },
    quartet: { ...inspection.quartet },
    task: {
      ...inspection.task,
      input: {
        ...inspection.task.input,
        contextPointerIds: [...inspection.task.input.contextPointerIds],
      },
      predecessors: inspection.task.predecessors.map((row) => ({ ...row })),
      doneDefinition: [...inspection.task.doneDefinition],
      returnTarget: { ...inspection.task.returnTarget },
      routeNodeIds: [...inspection.task.routeNodeIds],
    },
    runtimeRequest,
    routeIdempotencyKey,
    dryRunReturnPlan,
    boundary: {
      state: "prepared_not_dispatched" as const,
      dispatchAuthorized: false as const,
      processStartAuthorized: false as const,
      codexTaskStartAuthorized: false as const,
      taskCreated: false as const,
      codexTaskId: null,
      deliveryStatus: "not_started" as const,
      returnActionExecutionAuthorized: false as const,
      sourceCompletionAuthorized: false as const,
      outcomeVerificationAuthorized: false as const,
    },
    privacy: {
      sourceBodiesStored: false as const,
      localPathsStored: false as const,
      rawBiometricsStored: false as const,
      ownerIdentityStored: false as const,
      credentialsStored: false as const,
      participantIdentitiesStored: false as const,
      unboundedWorkspaceContextStored: false as const,
    },
  };
  const handoffManifestDigest = taskMapContractDigest({
    domain: MANIFEST_DOMAIN,
    ...core,
  });
  const manifest: TaskMapAgentHandoffManifestV1 = {
    ...core,
    handoffManifestId: `tmhandoff_${handoffManifestDigest}`,
    handoffManifestDigest,
  };
  if (taskMapProjectionPrivacyLeakReasons(manifest).length > 0) {
    fail("handoff manifest violates the privacy boundary");
  }
  if (
    Buffer.byteLength(taskMapContractCanonicalJson(manifest), "utf8")
    > TASKMAP_AGENT_HANDOFF_LIMITS_V1.maxManifestBytes
  ) {
    fail("handoff manifest exceeds the byte limit");
  }
  return {
    manifest,
    summary: buildSummary(manifest),
  };
}
