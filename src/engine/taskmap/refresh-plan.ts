import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";
import {
  TASKMAP_SOURCE_ENVELOPE_VERSION,
  type TaskMapSourceKind,
} from "./types.js";

/**
 * P10.1A is deliberately a pure planning contract. It contains no clock,
 * connector, filesystem, projection, task-runner, or source-writeback logic.
 */
export const TASKMAP_REFRESH_PLAN_DRAFT_VERSION =
  "taskmap-refresh-plan-draft.v1" as const;
export const TASKMAP_REFRESH_PLAN_VERSION =
  "taskmap-refresh-plan.v1" as const;
export const TASKMAP_REFRESH_LANE_VERSION =
  "taskmap-refresh-lane.v1" as const;
export const TASKMAP_REFRESH_BATCH_VERSION =
  "taskmap-refresh-ready-batch.v1" as const;
export const TASKMAP_REFRESH_BARRIER_POLICY_VERSION =
  "taskmap-refresh-all-settled-barrier.1" as const;
export const TASKMAP_REFRESH_REQUIREDNESS_POLICY_VERSION =
  "taskmap-refresh-requiredness.1" as const;
export const TASKMAP_REFRESH_SCHEDULING_POLICY_VERSION =
  "taskmap-refresh-scheduling.1" as const;
export const TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION =
  "taskmap-owner-review-attestation.v2" as const;

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_IDENTIFIER =
  /^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$/;
const EMAIL_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const URI_SCHEME = /(?:^|[^A-Za-z0-9_])[a-z][a-z0-9+.-]*:\/\//i;
const ENCODED_PATH = /%(?:2f|5c|7e|3a)/i;
const RFC3339_TEXT =
  /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})\b/;
const COMMON_SECRET_TEXT =
  /(?:\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\b(?:gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255})\b|\bsk-(?:proj-)?[A-Za-z0-9_-]{16,255}\b|\bxox[baprs]-[A-Za-z0-9-]{10,255}\b|\bAIza[A-Za-z0-9_-]{20,64}\b|\bsk_live_[A-Za-z0-9]{16,255}\b|\bnpm_[A-Za-z0-9]{20,255}\b|\beyJ[A-Za-z0-9_-]{5,255}\.[A-Za-z0-9_-]{5,255}\.[A-Za-z0-9_-]{5,255}\b|bearer\s+[A-Za-z0-9._~-]{8,}|-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----|BEGIN [A-Z0-9 ]*PRIVATE KEY)/i;
const FORBIDDEN_WORK_SEMANTICS =
  /\b(?:task|root)\s+(?:priority|rank|readiness|route|urgency)\b|\b(?:dispatch|approve\s*&\s*run)\b/i;
const PRIVATE_IDENTIFIER_NAMESPACE =
  /(?:^|[._:-])(?:attendee|contact|customer|email|guest|member|participant|person|phone|user)(?:[._:-]|$)/i;
export const TASKMAP_REFRESH_PLAN_LIMITS_V1 = Object.freeze({
  maxLanes: 1_024,
  maxConcurrency: 64,
  maxPriorityReasonCodesPerLane: 64,
  maxOutputKindsPerLane: 64,
  maxResourceClaimsPerLane: 4_096,
  maxTotalResourceClaims: 4_096,
  maxInputDigestsPerLane: 256,
  maxPredecessorsPerLane: 256,
  maxTotalInputDigests: 4_096,
  maxTotalPredecessorEdges: 4_096,
  maxRawStringBytes: 4_096,
  maxRawNestingDepth: 64,
  maxRawObjectKeys: 64,
  maxRawNodes: 131_072,
  maxCanonicalPlanBytes: 4 * 1_024 * 1_024,
} as const);

const MAX_LANES = TASKMAP_REFRESH_PLAN_LIMITS_V1.maxLanes;
const MAX_CONCURRENCY =
  TASKMAP_REFRESH_PLAN_LIMITS_V1.maxConcurrency;
const MAX_SET_ITEMS = 4_096;
const MAX_PRIORITY_REASON_CODES_PER_LANE =
  TASKMAP_REFRESH_PLAN_LIMITS_V1.maxPriorityReasonCodesPerLane;
const MAX_OUTPUT_KINDS_PER_LANE =
  TASKMAP_REFRESH_PLAN_LIMITS_V1.maxOutputKindsPerLane;
const MAX_RESOURCE_CLAIMS_PER_LANE =
  TASKMAP_REFRESH_PLAN_LIMITS_V1.maxResourceClaimsPerLane;
const MAX_TOTAL_RESOURCE_CLAIMS =
  TASKMAP_REFRESH_PLAN_LIMITS_V1.maxTotalResourceClaims;
const MAX_INPUT_DIGESTS_PER_LANE =
  TASKMAP_REFRESH_PLAN_LIMITS_V1.maxInputDigestsPerLane;
const MAX_PREDECESSORS_PER_LANE =
  TASKMAP_REFRESH_PLAN_LIMITS_V1.maxPredecessorsPerLane;
const MAX_TOTAL_INPUT_DIGESTS =
  TASKMAP_REFRESH_PLAN_LIMITS_V1.maxTotalInputDigests;
const MAX_TOTAL_PREDECESSOR_EDGES =
  TASKMAP_REFRESH_PLAN_LIMITS_V1.maxTotalPredecessorEdges;
const MAX_RAW_STRING_BYTES =
  TASKMAP_REFRESH_PLAN_LIMITS_V1.maxRawStringBytes;
const MAX_RAW_NESTING_DEPTH =
  TASKMAP_REFRESH_PLAN_LIMITS_V1.maxRawNestingDepth;
const MAX_RAW_OBJECT_KEYS =
  TASKMAP_REFRESH_PLAN_LIMITS_V1.maxRawObjectKeys;
const MAX_RAW_NODES =
  TASKMAP_REFRESH_PLAN_LIMITS_V1.maxRawNodes;
const MAX_CANONICAL_PLAN_BYTES =
  TASKMAP_REFRESH_PLAN_LIMITS_V1.maxCanonicalPlanBytes;

const PLAN_DRAFT_KEYS = new Set([
  "contractVersion",
  "ownerScopeDigest",
  "baseline",
  "reviewedDigests",
  "sourceBindings",
  "sourceRevisions",
  "sourceRevisionSets",
  "semanticInputDigests",
  "deterministicReplayDigest",
  "policyBindings",
  "lanes",
]);
const PLAN_KEYS = new Set([
  "contractVersion",
  "planId",
  "ownerScopeDigest",
  "baseline",
  "reviewedDigests",
  "reviewedEvidenceDigest",
  "sourceBindings",
  "sourceRevisions",
  "sourceRevisionSets",
  "sourceRevisionDigests",
  "semanticInputDigests",
  "deterministicReplayDigest",
  "policyBindings",
  "policyBundleDigest",
  "semanticImplementationDigest",
  "barrierPolicyVersion",
  "requirednessPolicyVersion",
  "schedulingPolicyVersion",
  "lanes",
  "candidateAcceptedStateDigest",
  "isExactNoOp",
  "refreshReasonCodes",
  "privacy",
]);
const BASELINE_KEYS = new Set([
  "kind",
  "priorCheckpointDigests",
  "priorSourceSliceDigests",
  "priorProviderArtifacts",
  "priorAcceptedStateDigest",
  "priorOwnerScopeDigest",
  "priorSourceSnapshotDigest",
  "priorReviewedEvidenceDigest",
  "priorPolicyBundleDigest",
  "priorSemanticImplementationDigest",
  "acceptedSourceRevisions",
  "acceptedSourceRevisionSets",
  "acceptedSemanticInputDigests",
  "acceptedDeterministicReplayDigest",
]);
const REVIEWED_DIGEST_KEYS = new Set([
  "truthSetDigest",
  "reviewBatchDigest",
  "reviewAttestationVersion",
  "reviewAttestationDigest",
  "sourceManifestDigest",
]);
const SOURCE_BINDING_KEYS = new Set([
  "bindingDigest",
  "sourceKind",
  "sourceContractVersion",
  "adapterVersion",
]);
const SOURCE_REVISION_KEYS = new Set([
  "bindingDigest",
  "sourceIdentityDigest",
  "sourceRevisionDigest",
  "contentDigest",
]);
const SOURCE_REVISION_SET_KEYS = new Set([
  "bindingDigest",
  "revisionSetDigest",
]);
const PRIOR_PROVIDER_ARTIFACT_KEYS = new Set([
  "bindingDigest",
  "checkpointDigest",
  "sourceSliceDigest",
]);
const POLICY_BINDING_KEYS = new Set(["name", "version", "digest"]);
const LANE_KEYS = new Set([
  "contractVersion",
  "laneId",
  "goal",
  "operationVersion",
  "priority",
  "priorityReasonCodes",
  "predecessorLaneIds",
  "resourceClaims",
  "effect",
  "approvalGateId",
  "requiredForPublication",
  "inputDigests",
  "outputKinds",
]);
const BUILT_LANE_KEYS = new Set([...LANE_KEYS, "laneDigest"]);
const CLAIM_KEYS = new Set(["resourceId", "mode"]);
const SELECTION_KEYS = new Set(["maxConcurrency", "laneStates"]);
const READY_BATCH_KEYS = new Set([
  "contractVersion",
  "batchId",
  "planId",
  "candidateAcceptedStateDigest",
  "maxConcurrency",
  "laneStates",
  "activeClaims",
  "selectedLaneIds",
  "publication",
]);
const LANE_STATE_KEYS = new Set([
  "laneId",
  "status",
  "lastGoodCheckpointDigest",
  "lastGoodSourceSliceDigest",
  "errorCode",
  "errorDetailDigest",
]);

const PRIVACY = {
  sourceBodiesStored: false,
  emailBodiesStored: false,
  participantDetailsStored: false,
  rawBiometricsStored: false,
  fullAgentSessionBodiesStored: false,
  localPathsStored: false,
  secretsStored: false,
  taskExecutionFieldsStored: false,
} as const;

const VALID_SOURCE_KINDS = new Set<TaskMapSourceKind>([
  "linear",
  "jira",
  "github",
  "slack",
  "google_chat",
  "gmail",
  "google_calendar",
  "google_tasks",
  "gemini_meet",
  "granola",
  "codex_session",
  "claude_session",
  "cursor_session",
  "oura",
  "strategy",
  "manual",
  "unknown",
]);

export type TaskMapRefreshPriority = "P0" | "P1" | "P2";
export type TaskMapRefreshGoal =
  | "provider_collect"
  | "source_normalize"
  | "identity_dedupe_barrier"
  | "deterministic_gate"
  | "taskmap_projection"
  | "strategy_projection"
  | "publication"
  | "refresh_audit";
export type TaskMapRefreshPriorityReasonCode =
  | "source_freshness"
  | "identity_integrity"
  | "privacy_safety"
  | "deterministic_replay"
  | "publication_safety"
  | "connector_visibility"
  | "optional_projection"
  | "optional_enrichment"
  | "optional_audit"
  | "optional_automation";
export type TaskMapRefreshEffect =
  | "read_only"
  | "local_state"
  | "external_mutation";
export type TaskMapResourceClaimMode = "shared" | "exclusive";
export type TaskMapRefreshOutputKind =
  | "connector_checkpoint"
  | "source_slice"
  | "normalized_source"
  | "identity_set"
  | "gate_decision"
  | "taskmap_projection"
  | "strategy_projection"
  | "accepted_state"
  | "refresh_audit";
export type TaskMapRefreshPolicyName =
  | "source-policy"
  | "normalization-policy"
  | "identity-policy"
  | "publication-policy"
  | "scheduling-policy";
export type TaskMapRefreshLaneStatus =
  | "absent"
  | "pending"
  | "running"
  | "succeeded"
  | "partial"
  | "failed"
  | "skipped";
export type TaskMapRefreshErrorCode =
  | "provider_unavailable"
  | "provider_partial_result"
  | "upstream_unusable"
  | "deterministic_gate_failed"
  | "projection_failed"
  | "publication_failed"
  | "optional_lane_failed"
  | "refresh_operation_failed";

const PRIORITY_REASON_TO_PRIORITY: Record<
  TaskMapRefreshPriorityReasonCode,
  TaskMapRefreshPriority
> = {
  source_freshness: "P0",
  identity_integrity: "P0",
  privacy_safety: "P0",
  deterministic_replay: "P0",
  publication_safety: "P0",
  connector_visibility: "P1",
  optional_projection: "P1",
  optional_enrichment: "P1",
  optional_audit: "P2",
  optional_automation: "P2",
};
const VALID_PRIORITIES = new Set<TaskMapRefreshPriority>(["P0", "P1", "P2"]);
const VALID_PRIORITY_REASONS = new Set<TaskMapRefreshPriorityReasonCode>(
  Object.keys(PRIORITY_REASON_TO_PRIORITY) as TaskMapRefreshPriorityReasonCode[],
);
const VALID_EFFECTS = new Set<TaskMapRefreshEffect>([
  "read_only",
  "local_state",
  "external_mutation",
]);
const VALID_CLAIM_MODES = new Set<TaskMapResourceClaimMode>([
  "shared",
  "exclusive",
]);
const VALID_OUTPUT_KINDS = new Set<TaskMapRefreshOutputKind>([
  "connector_checkpoint",
  "source_slice",
  "normalized_source",
  "identity_set",
  "gate_decision",
  "taskmap_projection",
  "strategy_projection",
  "accepted_state",
  "refresh_audit",
]);
const REQUIRED_POLICY_NAMES = new Set<TaskMapRefreshPolicyName>([
  "source-policy",
  "normalization-policy",
  "identity-policy",
  "publication-policy",
  "scheduling-policy",
]);
const VALID_LANE_STATUSES = new Set<TaskMapRefreshLaneStatus>([
  "absent",
  "pending",
  "running",
  "succeeded",
  "partial",
  "failed",
  "skipped",
]);
const VALID_ERROR_CODES = new Set<TaskMapRefreshErrorCode>([
  "provider_unavailable",
  "provider_partial_result",
  "upstream_unusable",
  "deterministic_gate_failed",
  "projection_failed",
  "publication_failed",
  "optional_lane_failed",
  "refresh_operation_failed",
]);
const SETTLED_STATUSES = new Set<TaskMapRefreshLaneStatus>([
  "succeeded",
  "partial",
  "failed",
  "skipped",
]);

type LaneStage =
  | "collect"
  | "normalize"
  | "barrier"
  | "gate"
  | "taskmap_projection"
  | "strategy_projection"
  | "publication"
  | "audit";

const GOAL_STAGE: Record<TaskMapRefreshGoal, LaneStage> = {
  provider_collect: "collect",
  source_normalize: "normalize",
  identity_dedupe_barrier: "barrier",
  deterministic_gate: "gate",
  taskmap_projection: "taskmap_projection",
  strategy_projection: "strategy_projection",
  publication: "publication",
  refresh_audit: "audit",
};
const VALID_GOALS = new Set<TaskMapRefreshGoal>(
  Object.keys(GOAL_STAGE) as TaskMapRefreshGoal[],
);
const FAILURE_ERROR_CODES_BY_STAGE: Record<
  LaneStage,
  readonly TaskMapRefreshErrorCode[]
> = {
  collect: ["provider_unavailable", "refresh_operation_failed"],
  normalize: ["provider_unavailable", "refresh_operation_failed"],
  barrier: ["refresh_operation_failed"],
  gate: ["deterministic_gate_failed", "refresh_operation_failed"],
  taskmap_projection: ["projection_failed", "refresh_operation_failed"],
  strategy_projection: [
    "projection_failed",
    "optional_lane_failed",
    "refresh_operation_failed",
  ],
  publication: ["publication_failed", "refresh_operation_failed"],
  audit: ["optional_lane_failed", "refresh_operation_failed"],
};
const PARTIAL_ERROR_CODES_BY_STAGE: Record<
  LaneStage,
  readonly TaskMapRefreshErrorCode[]
> = {
  collect: ["provider_partial_result", "refresh_operation_failed"],
  normalize: ["provider_partial_result", "refresh_operation_failed"],
  barrier: ["refresh_operation_failed"],
  gate: ["deterministic_gate_failed", "refresh_operation_failed"],
  taskmap_projection: ["projection_failed", "refresh_operation_failed"],
  strategy_projection: [
    "projection_failed",
    "optional_lane_failed",
    "refresh_operation_failed",
  ],
  publication: ["publication_failed", "refresh_operation_failed"],
  audit: ["optional_lane_failed", "refresh_operation_failed"],
};
const STAGE_PRIORITY_REASONS: Record<
  LaneStage,
  ReadonlySet<TaskMapRefreshPriorityReasonCode>
> = {
  collect: new Set(["source_freshness"]),
  normalize: new Set(["identity_integrity"]),
  barrier: new Set(["identity_integrity"]),
  gate: new Set(["privacy_safety", "deterministic_replay"]),
  taskmap_projection: new Set(["publication_safety"]),
  publication: new Set(["publication_safety"]),
  strategy_projection: new Set([
    "optional_projection",
    "optional_enrichment",
    "optional_automation",
  ]),
  audit: new Set([
    "connector_visibility",
    "optional_enrichment",
    "optional_audit",
    "optional_automation",
  ]),
};

const OUTPUT_STAGE: Record<TaskMapRefreshOutputKind, LaneStage> = {
  connector_checkpoint: "collect",
  source_slice: "collect",
  normalized_source: "normalize",
  identity_set: "barrier",
  gate_decision: "gate",
  taskmap_projection: "taskmap_projection",
  strategy_projection: "strategy_projection",
  accepted_state: "publication",
  refresh_audit: "audit",
};

export interface TaskMapResourceClaimV1 {
  resourceId: string;
  mode: TaskMapResourceClaimMode;
}

export interface TaskMapRefreshSourceBindingV1 {
  bindingDigest: string;
  sourceKind: TaskMapSourceKind;
  sourceContractVersion: typeof TASKMAP_SOURCE_ENVELOPE_VERSION;
  adapterVersion: string;
}

export interface TaskMapRefreshSourceRevisionV1 {
  bindingDigest: string;
  sourceIdentityDigest: string;
  sourceRevisionDigest: string;
  contentDigest: string;
}

export interface TaskMapRefreshSourceRevisionSetV1 {
  bindingDigest: string;
  revisionSetDigest: string;
}

export interface TaskMapRefreshReviewedDigestsV1 {
  truthSetDigest: string;
  reviewBatchDigest: string;
  reviewAttestationVersion: typeof TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION;
  reviewAttestationDigest: string;
  sourceManifestDigest: string;
}

export interface TaskMapRefreshPriorProviderArtifactV1 {
  bindingDigest: string;
  checkpointDigest: string;
  sourceSliceDigest: string;
}

export interface TaskMapRefreshPolicyBindingV1 {
  name: TaskMapRefreshPolicyName;
  version: string;
  digest: string;
}

export interface TaskMapRefreshBaselineV1 {
  kind: "genesis" | "accepted";
  priorCheckpointDigests: string[];
  priorSourceSliceDigests: string[];
  priorProviderArtifacts: TaskMapRefreshPriorProviderArtifactV1[];
  priorAcceptedStateDigest?: string;
  priorOwnerScopeDigest?: string;
  priorSourceSnapshotDigest?: string;
  priorReviewedEvidenceDigest?: string;
  priorPolicyBundleDigest?: string;
  priorSemanticImplementationDigest?: string;
  acceptedSourceRevisions: TaskMapRefreshSourceRevisionV1[];
  acceptedSourceRevisionSets: TaskMapRefreshSourceRevisionSetV1[];
  acceptedSemanticInputDigests: string[];
  acceptedDeterministicReplayDigest?: string;
}

export interface TaskMapRefreshLaneV1 {
  contractVersion: typeof TASKMAP_REFRESH_LANE_VERSION;
  laneDigest: string;
  laneId: string;
  goal: TaskMapRefreshGoal;
  operationVersion: string;
  priority: TaskMapRefreshPriority;
  priorityReasonCodes: TaskMapRefreshPriorityReasonCode[];
  predecessorLaneIds: string[];
  resourceClaims: TaskMapResourceClaimV1[];
  effect: TaskMapRefreshEffect;
  approvalGateId?: string;
  requiredForPublication: boolean;
  inputDigests: string[];
  outputKinds: TaskMapRefreshOutputKind[];
}

export type TaskMapRefreshLaneDraftV1 = Omit<
  TaskMapRefreshLaneV1,
  "laneDigest"
>;

export interface TaskMapRefreshPlanDraftV1 {
  contractVersion: typeof TASKMAP_REFRESH_PLAN_DRAFT_VERSION;
  ownerScopeDigest: string;
  baseline: TaskMapRefreshBaselineV1;
  reviewedDigests: TaskMapRefreshReviewedDigestsV1;
  sourceBindings: TaskMapRefreshSourceBindingV1[];
  sourceRevisions: TaskMapRefreshSourceRevisionV1[];
  sourceRevisionSets: TaskMapRefreshSourceRevisionSetV1[];
  semanticInputDigests: string[];
  deterministicReplayDigest: string;
  policyBindings: TaskMapRefreshPolicyBindingV1[];
  lanes: TaskMapRefreshLaneDraftV1[];
}

export type TaskMapRefreshReasonCode =
  | "genesis"
  | "source_revision_changed"
  | "semantic_input_changed"
  | "deterministic_replay_changed"
  | "reviewed_evidence_changed"
  | "policy_bundle_changed"
  | "semantic_implementation_changed"
  | "exact_source_input_replay_match";

export interface TaskMapRefreshPlanV1 {
  contractVersion: typeof TASKMAP_REFRESH_PLAN_VERSION;
  planId: string;
  ownerScopeDigest: string;
  baseline: TaskMapRefreshBaselineV1;
  reviewedDigests: TaskMapRefreshReviewedDigestsV1;
  reviewedEvidenceDigest: string;
  sourceBindings: TaskMapRefreshSourceBindingV1[];
  sourceRevisions: TaskMapRefreshSourceRevisionV1[];
  sourceRevisionSets: TaskMapRefreshSourceRevisionSetV1[];
  sourceRevisionDigests: string[];
  semanticInputDigests: string[];
  deterministicReplayDigest: string;
  policyBindings: TaskMapRefreshPolicyBindingV1[];
  policyBundleDigest: string;
  semanticImplementationDigest: string;
  barrierPolicyVersion: typeof TASKMAP_REFRESH_BARRIER_POLICY_VERSION;
  requirednessPolicyVersion: typeof TASKMAP_REFRESH_REQUIREDNESS_POLICY_VERSION;
  schedulingPolicyVersion: typeof TASKMAP_REFRESH_SCHEDULING_POLICY_VERSION;
  lanes: TaskMapRefreshLaneV1[];
  candidateAcceptedStateDigest: string;
  isExactNoOp: boolean;
  refreshReasonCodes: TaskMapRefreshReasonCode[];
  privacy: typeof PRIVACY;
}

export interface TaskMapRefreshLaneStateV1 {
  laneId: string;
  status: TaskMapRefreshLaneStatus;
  lastGoodCheckpointDigest?: string;
  lastGoodSourceSliceDigest?: string;
  errorCode?: TaskMapRefreshErrorCode;
  errorDetailDigest?: string;
}

export interface TaskMapRefreshSelectionDraftV1 {
  maxConcurrency: number;
  laneStates: TaskMapRefreshLaneStateV1[];
}

export interface TaskMapActiveResourceClaimV1 extends TaskMapResourceClaimV1 {
  laneId: string;
}

export type TaskMapPublicationState =
  | "waiting"
  | "blocked"
  | "ready"
  | "running"
  | "complete"
  | "no_op";
export type TaskMapPublicationReasonCode =
  | "required_lane_absent"
  | "required_lane_pending"
  | "required_lane_running"
  | "required_lane_partial"
  | "required_lane_failed"
  | "required_lane_skipped"
  | "approval_authority_unavailable"
  | "publication_ready"
  | "publication_running"
  | "publication_complete"
  | "exact_replay_no_op";

export interface TaskMapRefreshPublicationV1 {
  state: TaskMapPublicationState;
  eligible: boolean;
  reasonCodes: TaskMapPublicationReasonCode[];
  priorAcceptedStateDigest?: string;
  candidateAcceptedStateDigest: string;
  preservesPriorAcceptedState: true;
}

export interface TaskMapReadyBatchV1 {
  contractVersion: typeof TASKMAP_REFRESH_BATCH_VERSION;
  batchId: string;
  planId: string;
  candidateAcceptedStateDigest: string;
  maxConcurrency: number;
  laneStates: TaskMapRefreshLaneStateV1[];
  activeClaims: TaskMapActiveResourceClaimV1[];
  selectedLaneIds: string[];
  publication: TaskMapRefreshPublicationV1;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableId(prefix: string, value: unknown): string {
  return `${prefix}_${taskMapContractDigest(value)}`;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function assertPlainObject(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertOnlyKeys(
  value: unknown,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  assertPlainObject(value, label);
  const unknown = Object.keys(value)
    .filter((key) => !allowed.has(key))
    .sort(compareText);
  if (unknown.length > 0) {
    throw new Error(`${label} contains forbidden or unknown fields: ${unknown.join(", ")}`);
  }
}

function containsLocalPath(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (index > 0 && /[A-Za-z0-9_]/.test(value[index - 1])) continue;
    const remainder = value.slice(index);
    if (
      remainder.startsWith("/")
      || remainder.startsWith("~/")
      || remainder.startsWith("~\\")
      || remainder.startsWith("./")
      || remainder.startsWith(".\\")
      || remainder.startsWith("../")
      || remainder.startsWith("..\\")
      || /^[A-Za-z]:[\\/]/.test(remainder)
      || remainder.startsWith("\\\\")
    ) {
      return true;
    }
  }
  return false;
}

function assertNoPrivateContent(value: unknown, label: string): void {
  if (typeof value === "string") {
    if (
      EMAIL_TEXT.test(value)
      || URI_SCHEME.test(value)
      || ENCODED_PATH.test(value)
      || RFC3339_TEXT.test(value)
      || containsLocalPath(value)
      || /(?:\$HOME|\$\{HOME\})[\\/]/.test(value)
      || COMMON_SECRET_TEXT.test(value)
      || FORBIDDEN_WORK_SEMANTICS.test(value)
      || /[\u0000-\u001f\u007f]/.test(value)
    ) {
      throw new Error(`${label} contains private, unsafe, or task-execution text`);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertNoPrivateContent(item, label);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      assertNoPrivateContent(key, label);
      assertNoPrivateContent(item, label);
    }
  }
}

function assertDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new Error(`${label} must be a full lowercase SHA-256 digest`);
  }
}

function assertSafeIdentifier(value: unknown, label: string): asserts value is string {
  // These identifiers are registry-owned operation codes, never source- or
  // user-derived labels. Digests are the only accepted source/account identity.
  if (
    typeof value !== "string"
    || value.length < 2
    || value.length > 160
    || !SAFE_IDENTIFIER.test(value)
    || PRIVATE_IDENTIFIER_NAMESPACE.test(value)
  ) {
    throw new Error(`${label} must be a bounded ASCII opaque identifier`);
  }
  assertNoPrivateContent(value, label);
}

function assertGoal(value: unknown): asserts value is TaskMapRefreshGoal {
  if (!VALID_GOALS.has(value as TaskMapRefreshGoal)) {
    throw new Error("refresh lane goal must be a closed operation code");
  }
}

function normalizeDigestSet(
  value: unknown,
  label: string,
  allowEmpty = false,
): string[] {
  if (!Array.isArray(value) || value.length > MAX_SET_ITEMS) {
    throw new Error(`${label} must be a bounded digest array`);
  }
  if (!allowEmpty && value.length === 0) {
    throw new Error(`${label} must not be empty`);
  }
  for (const item of value) assertDigest(item, `${label} item`);
  return [...new Set(value)].sort(compareText);
}

function normalizeIdentifierSet(
  value: unknown,
  label: string,
  allowEmpty = true,
): string[] {
  if (!Array.isArray(value) || value.length > MAX_SET_ITEMS) {
    throw new Error(`${label} must be a bounded identifier array`);
  }
  if (!allowEmpty && value.length === 0) {
    throw new Error(`${label} must not be empty`);
  }
  for (const item of value) assertSafeIdentifier(item, `${label} item`);
  return [...new Set(value)].sort(compareText);
}

function normalizeClaims(
  value: unknown,
  label = "resource claims",
): TaskMapResourceClaimV1[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be a bounded array`);
  }
  if (value.length === 0) {
    throw new Error(`${label} must contain at least one resource claim`);
  }
  if (value.length > MAX_RESOURCE_CLAIMS_PER_LANE) {
    throw new Error(`${label} must be a bounded array`);
  }
  const byResource = new Map<string, TaskMapResourceClaimV1>();
  for (const item of value) {
    assertOnlyKeys(item, CLAIM_KEYS, "resource claim");
    const claim = item as unknown as TaskMapResourceClaimV1;
    assertSafeIdentifier(claim.resourceId, "resourceId");
    if (!VALID_CLAIM_MODES.has(claim.mode)) {
      throw new Error("resource claim mode is unknown");
    }
    const prior = byResource.get(claim.resourceId);
    if (prior && prior.mode !== claim.mode) {
      throw new Error("resource claim has contradictory shared and exclusive modes");
    }
    byResource.set(claim.resourceId, {
      resourceId: claim.resourceId,
      mode: claim.mode,
    });
  }
  return [...byResource.values()].sort((left, right) => (
    compareText(left.resourceId, right.resourceId)
    || compareText(left.mode, right.mode)
  ));
}

function normalizeSourceRevision(
  value: unknown,
  label: string,
): TaskMapRefreshSourceRevisionV1 {
  assertOnlyKeys(value, SOURCE_REVISION_KEYS, label);
  const revision = value as unknown as TaskMapRefreshSourceRevisionV1;
  assertDigest(revision.bindingDigest, `${label} bindingDigest`);
  assertDigest(revision.sourceIdentityDigest, `${label} sourceIdentityDigest`);
  assertDigest(revision.sourceRevisionDigest, `${label} sourceRevisionDigest`);
  assertDigest(revision.contentDigest, `${label} contentDigest`);
  return {
    bindingDigest: revision.bindingDigest,
    sourceIdentityDigest: revision.sourceIdentityDigest,
    sourceRevisionDigest: revision.sourceRevisionDigest,
    contentDigest: revision.contentDigest,
  };
}

function normalizeSourceRevisions(
  value: unknown,
  label: string,
  allowEmpty = false,
): TaskMapRefreshSourceRevisionV1[] {
  if (!Array.isArray(value) || value.length > MAX_SET_ITEMS) {
    throw new Error(`${label} must be a bounded array`);
  }
  if (!allowEmpty && value.length === 0) {
    throw new Error(`${label} must not be empty`);
  }
  const byIdentity = new Map<string, TaskMapRefreshSourceRevisionV1>();
  for (const item of value) {
    const revision = normalizeSourceRevision(item, `${label} item`);
    const identityKey =
      `${revision.bindingDigest}:${revision.sourceIdentityDigest}`;
    const prior = byIdentity.get(identityKey);
    if (prior) {
      if (
        prior.sourceRevisionDigest === revision.sourceRevisionDigest
        && prior.contentDigest !== revision.contentDigest
      ) {
        throw new Error(
          "identical source identity and revision cannot change content digest",
        );
      }
      if (taskMapContractCanonicalJson(prior) !== taskMapContractCanonicalJson(revision)) {
        throw new Error("source snapshot contains contradictory current revisions");
      }
    }
    byIdentity.set(identityKey, revision);
  }
  return [...byIdentity.values()].sort((left, right) => (
    compareText(left.bindingDigest, right.bindingDigest)
    || compareText(left.sourceIdentityDigest, right.sourceIdentityDigest)
    || compareText(left.sourceRevisionDigest, right.sourceRevisionDigest)
    || compareText(left.contentDigest, right.contentDigest)
  ));
}

function revisionSetDigestFor(
  bindingDigest: string,
  revisions: readonly TaskMapRefreshSourceRevisionV1[],
): string {
  return taskMapContractDigest(
    revisions
      .filter((revision) => revision.bindingDigest === bindingDigest)
      .map((revision) => ({
        sourceIdentityDigest: revision.sourceIdentityDigest,
        sourceRevisionDigest: revision.sourceRevisionDigest,
        contentDigest: revision.contentDigest,
      }))
      .sort((left, right) => (
        compareText(left.sourceIdentityDigest, right.sourceIdentityDigest)
        || compareText(left.sourceRevisionDigest, right.sourceRevisionDigest)
        || compareText(left.contentDigest, right.contentDigest)
      )),
  );
}

function normalizeSourceRevisionSets(
  value: unknown,
  label: string,
): TaskMapRefreshSourceRevisionSetV1[] {
  if (!Array.isArray(value) || value.length > MAX_SET_ITEMS) {
    throw new Error(`${label} must be a bounded array`);
  }
  const byBinding = new Map<string, TaskMapRefreshSourceRevisionSetV1>();
  for (const item of value) {
    assertOnlyKeys(item, SOURCE_REVISION_SET_KEYS, `${label} item`);
    const revisionSet =
      item as unknown as TaskMapRefreshSourceRevisionSetV1;
    assertDigest(
      revisionSet.bindingDigest,
      `${label} bindingDigest`,
    );
    assertDigest(
      revisionSet.revisionSetDigest,
      `${label} revisionSetDigest`,
    );
    if (byBinding.has(revisionSet.bindingDigest)) {
      throw new Error(`${label} contains a duplicate binding`);
    }
    byBinding.set(revisionSet.bindingDigest, {
      bindingDigest: revisionSet.bindingDigest,
      revisionSetDigest: revisionSet.revisionSetDigest,
    });
  }
  return [...byBinding.values()].sort((left, right) => (
    compareText(left.bindingDigest, right.bindingDigest)
  ));
}

function assertSourceRevisionSets(
  revisionSets: readonly TaskMapRefreshSourceRevisionSetV1[],
  revisions: readonly TaskMapRefreshSourceRevisionV1[],
  declaredBindingDigests: readonly string[],
  label: string,
): void {
  const declaredBindings = new Set(declaredBindingDigests);
  const setsByBinding = new Map(
    revisionSets.map((revisionSet) => [
      revisionSet.bindingDigest,
      revisionSet,
    ]),
  );
  for (const revisionSet of revisionSets) {
    if (!declaredBindings.has(revisionSet.bindingDigest)) {
      throw new Error(`${label} references an undeclared source binding`);
    }
    const expected = revisionSetDigestFor(
      revisionSet.bindingDigest,
      revisions,
    );
    if (revisionSet.revisionSetDigest !== expected) {
      throw new Error(
        `${label} digest does not match its canonical sorted revision triples`,
      );
    }
  }
  for (const revision of revisions) {
    if (!setsByBinding.has(revision.bindingDigest)) {
      throw new Error(`${label} is missing evidence for a revision binding`);
    }
  }
  if (
    declaredBindingDigests.some(
      (bindingDigest) => !setsByBinding.has(bindingDigest),
    )
  ) {
    throw new Error(
      `${label} requires one canonical digest for every declared binding`,
    );
  }
}

function normalizeReviewedDigests(
  value: unknown,
): TaskMapRefreshReviewedDigestsV1 {
  assertOnlyKeys(value, REVIEWED_DIGEST_KEYS, "reviewed digests");
  const reviewed = value as unknown as TaskMapRefreshReviewedDigestsV1;
  assertDigest(reviewed.truthSetDigest, "truthSetDigest");
  assertDigest(reviewed.reviewBatchDigest, "reviewBatchDigest");
  if (
    reviewed.reviewAttestationVersion
    !== TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION
  ) {
    throw new Error("review attestation version is unsupported");
  }
  assertDigest(reviewed.reviewAttestationDigest, "reviewAttestationDigest");
  assertDigest(reviewed.sourceManifestDigest, "sourceManifestDigest");
  return {
    truthSetDigest: reviewed.truthSetDigest,
    reviewBatchDigest: reviewed.reviewBatchDigest,
    reviewAttestationVersion: reviewed.reviewAttestationVersion,
    reviewAttestationDigest: reviewed.reviewAttestationDigest,
    sourceManifestDigest: reviewed.sourceManifestDigest,
  };
}

function normalizeSourceBindings(
  value: unknown,
): TaskMapRefreshSourceBindingV1[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SET_ITEMS) {
    throw new Error("sourceBindings must be a bounded non-empty array");
  }
  const byBinding = new Map<string, TaskMapRefreshSourceBindingV1>();
  for (const item of value) {
    assertOnlyKeys(item, SOURCE_BINDING_KEYS, "source binding");
    const binding = item as unknown as TaskMapRefreshSourceBindingV1;
    assertDigest(binding.bindingDigest, "source binding digest");
    if (!VALID_SOURCE_KINDS.has(binding.sourceKind)) {
      throw new Error("source binding sourceKind is unknown");
    }
    if (binding.sourceContractVersion !== TASKMAP_SOURCE_ENVELOPE_VERSION) {
      throw new Error("source binding source contract version is unsupported");
    }
    assertSafeIdentifier(binding.adapterVersion, "adapterVersion");
    const normalized: TaskMapRefreshSourceBindingV1 = {
      bindingDigest: binding.bindingDigest,
      sourceKind: binding.sourceKind,
      sourceContractVersion: binding.sourceContractVersion,
      adapterVersion: binding.adapterVersion,
    };
    const prior = byBinding.get(binding.bindingDigest);
    if (
      prior
      && taskMapContractCanonicalJson(prior) !== taskMapContractCanonicalJson(normalized)
    ) {
      throw new Error("one binding digest cannot declare contradictory source metadata");
    }
    byBinding.set(binding.bindingDigest, normalized);
  }
  return [...byBinding.values()].sort((left, right) => (
    compareText(left.bindingDigest, right.bindingDigest)
  ));
}

function normalizePolicyBindings(
  value: unknown,
): TaskMapRefreshPolicyBindingV1[] {
  if (!Array.isArray(value) || value.length > MAX_SET_ITEMS) {
    throw new Error("policyBindings must be a bounded array");
  }
  const byName = new Map<TaskMapRefreshPolicyName, TaskMapRefreshPolicyBindingV1>();
  for (const item of value) {
    assertOnlyKeys(item, POLICY_BINDING_KEYS, "refresh policy binding");
    const policy = item as unknown as TaskMapRefreshPolicyBindingV1;
    if (!REQUIRED_POLICY_NAMES.has(policy.name)) {
      throw new Error("refresh policy name is unknown");
    }
    assertSafeIdentifier(policy.version, "refresh policy version");
    assertDigest(policy.digest, "refresh policy digest");
    if (byName.has(policy.name)) {
      throw new Error(`refresh policy ${policy.name} is duplicated`);
    }
    byName.set(policy.name, {
      name: policy.name,
      version: policy.version,
      digest: policy.digest,
    });
  }
  const missing = [...REQUIRED_POLICY_NAMES]
    .filter((name) => !byName.has(name))
    .sort(compareText);
  if (missing.length > 0) {
    throw new Error(`refresh policy bundle is missing: ${missing.join(", ")}`);
  }
  return [...byName.values()].sort((left, right) => compareText(left.name, right.name));
}

function normalizePriorProviderArtifacts(
  value: unknown,
): TaskMapRefreshPriorProviderArtifactV1[] {
  if (!Array.isArray(value) || value.length > MAX_SET_ITEMS) {
    throw new Error("priorProviderArtifacts must be a bounded array");
  }
  const byBinding = new Map<
    string,
    TaskMapRefreshPriorProviderArtifactV1
  >();
  for (const item of value) {
    assertOnlyKeys(
      item,
      PRIOR_PROVIDER_ARTIFACT_KEYS,
      "prior provider artifact",
    );
    const artifact =
      item as unknown as TaskMapRefreshPriorProviderArtifactV1;
    assertDigest(artifact.bindingDigest, "prior artifact bindingDigest");
    assertDigest(artifact.checkpointDigest, "prior artifact checkpointDigest");
    assertDigest(artifact.sourceSliceDigest, "prior artifact sourceSliceDigest");
    if (byBinding.has(artifact.bindingDigest)) {
      throw new Error("prior provider artifact binding is duplicated");
    }
    byBinding.set(artifact.bindingDigest, {
      bindingDigest: artifact.bindingDigest,
      checkpointDigest: artifact.checkpointDigest,
      sourceSliceDigest: artifact.sourceSliceDigest,
    });
  }
  return [...byBinding.values()].sort((left, right) => (
    compareText(left.bindingDigest, right.bindingDigest)
  ));
}

function normalizeBaseline(value: unknown): TaskMapRefreshBaselineV1 {
  assertOnlyKeys(value, BASELINE_KEYS, "refresh baseline");
  const baseline = value as unknown as TaskMapRefreshBaselineV1;
  if (baseline.kind !== "genesis" && baseline.kind !== "accepted") {
    throw new Error("refresh baseline kind is unknown");
  }
  const normalized: TaskMapRefreshBaselineV1 = {
    kind: baseline.kind,
    priorCheckpointDigests: normalizeDigestSet(
      baseline.priorCheckpointDigests,
      "prior checkpoint digests",
      true,
    ),
    priorSourceSliceDigests: normalizeDigestSet(
      baseline.priorSourceSliceDigests,
      "prior source-slice digests",
      true,
    ),
    priorProviderArtifacts: normalizePriorProviderArtifacts(
      baseline.priorProviderArtifacts,
    ),
    acceptedSourceRevisions: normalizeSourceRevisions(
      baseline.acceptedSourceRevisions,
      "accepted source revisions",
      true,
    ),
    acceptedSourceRevisionSets: normalizeSourceRevisionSets(
      baseline.acceptedSourceRevisionSets,
      "accepted source revision sets",
    ),
    acceptedSemanticInputDigests: normalizeDigestSet(
      baseline.acceptedSemanticInputDigests,
      "accepted semantic input digests",
      true,
    ),
  };
  for (const [key, label] of [
    ["priorAcceptedStateDigest", "prior accepted-state digest"],
    ["priorOwnerScopeDigest", "prior owner-scope digest"],
    ["priorSourceSnapshotDigest", "prior source-snapshot digest"],
    ["priorReviewedEvidenceDigest", "prior reviewed-evidence digest"],
    ["priorPolicyBundleDigest", "prior policy-bundle digest"],
    [
      "priorSemanticImplementationDigest",
      "prior semantic-implementation digest",
    ],
    ["acceptedDeterministicReplayDigest", "accepted deterministic replay digest"],
  ] as const) {
    const item = baseline[key];
    if (item !== undefined) {
      assertDigest(item, label);
      normalized[key] = item;
    }
  }
  if (
    !setEquals(
      normalized.priorCheckpointDigests,
      [...new Set(normalized.priorProviderArtifacts.map(
        (artifact) => artifact.checkpointDigest,
      ))].sort(compareText),
    )
    || !setEquals(
      normalized.priorSourceSliceDigests,
      [...new Set(normalized.priorProviderArtifacts.map(
        (artifact) => artifact.sourceSliceDigest,
      ))].sort(compareText),
    )
  ) {
    throw new Error(
      "prior checkpoint/source-slice digests must match paired provider artifacts",
    );
  }
  if (normalized.kind === "genesis") {
    if (
      normalized.priorCheckpointDigests.length > 0
      || normalized.priorSourceSliceDigests.length > 0
      || normalized.priorProviderArtifacts.length > 0
      || normalized.acceptedSourceRevisions.length > 0
      || normalized.acceptedSourceRevisionSets.length > 0
      || normalized.acceptedSemanticInputDigests.length > 0
      || normalized.priorAcceptedStateDigest !== undefined
      || normalized.priorOwnerScopeDigest !== undefined
      || normalized.priorSourceSnapshotDigest !== undefined
      || normalized.priorReviewedEvidenceDigest !== undefined
      || normalized.priorPolicyBundleDigest !== undefined
      || normalized.priorSemanticImplementationDigest !== undefined
      || normalized.acceptedDeterministicReplayDigest !== undefined
    ) {
      throw new Error("genesis baseline cannot claim prior accepted artifacts");
    }
  } else if (
    normalized.priorCheckpointDigests.length === 0
    || normalized.priorSourceSliceDigests.length === 0
    || normalized.acceptedSourceRevisionSets.length === 0
    || normalized.acceptedSemanticInputDigests.length === 0
    || normalized.priorAcceptedStateDigest === undefined
    || normalized.priorOwnerScopeDigest === undefined
    || normalized.priorSourceSnapshotDigest === undefined
    || normalized.priorReviewedEvidenceDigest === undefined
    || normalized.priorPolicyBundleDigest === undefined
    || normalized.priorSemanticImplementationDigest === undefined
    || normalized.acceptedDeterministicReplayDigest === undefined
  ) {
    throw new Error("accepted baseline requires complete prior digest references");
  }
  return normalized;
}

function normalizeLane(value: unknown): TaskMapRefreshLaneV1 {
  assertOnlyKeys(value, LANE_KEYS, "refresh lane");
  const lane = value as unknown as TaskMapRefreshLaneDraftV1;
  if (lane.contractVersion !== TASKMAP_REFRESH_LANE_VERSION) {
    throw new Error("refresh lane contract version is unsupported");
  }
  assertSafeIdentifier(lane.laneId, "laneId");
  assertGoal(lane.goal);
  assertSafeIdentifier(lane.operationVersion, "operationVersion");
  if (!VALID_PRIORITIES.has(lane.priority)) {
    throw new Error("refresh lane priority is unknown");
  }
  if (
    !Array.isArray(lane.priorityReasonCodes)
    || lane.priorityReasonCodes.length === 0
    || lane.priorityReasonCodes.length > MAX_PRIORITY_REASON_CODES_PER_LANE
  ) {
    throw new Error("priorityReasonCodes must be a non-empty array");
  }
  const priorityReasonCodes = [
    ...new Set(lane.priorityReasonCodes),
  ].sort(compareText);
  for (const reason of priorityReasonCodes) {
    if (!VALID_PRIORITY_REASONS.has(reason)) {
      throw new Error("refresh lane priority reason is unknown");
    }
    if (PRIORITY_REASON_TO_PRIORITY[reason] !== lane.priority) {
      throw new Error("refresh lane priority must be derived from its reason codes");
    }
  }
  if (
    !Array.isArray(lane.predecessorLaneIds)
    || lane.predecessorLaneIds.length > MAX_PREDECESSORS_PER_LANE
  ) {
    throw new Error(
      `predecessorLaneIds exceed the per-lane bound of ${MAX_PREDECESSORS_PER_LANE}`,
    );
  }
  const predecessorLaneIds = normalizeIdentifierSet(
    lane.predecessorLaneIds,
    "predecessorLaneIds",
  );
  const resourceClaims = normalizeClaims(lane.resourceClaims);
  if (!VALID_EFFECTS.has(lane.effect)) {
    throw new Error("refresh lane effect is unknown");
  }
  if (lane.approvalGateId !== undefined) {
    assertSafeIdentifier(lane.approvalGateId, "approvalGateId");
  }
  if (lane.effect === "external_mutation" && lane.approvalGateId === undefined) {
    throw new Error("external_mutation refresh lanes require an approval gate");
  }
  if (
    lane.effect === "external_mutation"
    && !resourceClaims.some((claim) => claim.mode === "exclusive")
  ) {
    throw new Error(
      "external_mutation refresh lanes require an exclusive resource claim",
    );
  }
  if (typeof lane.requiredForPublication !== "boolean") {
    throw new Error("requiredForPublication must be boolean");
  }
  if (
    !Array.isArray(lane.inputDigests)
    || lane.inputDigests.length > MAX_INPUT_DIGESTS_PER_LANE
  ) {
    throw new Error(
      `lane inputDigests exceed the per-lane bound of ${MAX_INPUT_DIGESTS_PER_LANE}`,
    );
  }
  const inputDigests = normalizeDigestSet(lane.inputDigests, "lane inputDigests");
  if (
    !Array.isArray(lane.outputKinds)
    || lane.outputKinds.length === 0
    || lane.outputKinds.length > MAX_OUTPUT_KINDS_PER_LANE
  ) {
    throw new Error("outputKinds must be a non-empty array");
  }
  const outputKinds = [...new Set(lane.outputKinds)].sort(compareText);
  for (const outputKind of outputKinds) {
    if (!VALID_OUTPUT_KINDS.has(outputKind)) {
      throw new Error("refresh lane output kind is unknown");
    }
  }
  const core = {
    contractVersion: TASKMAP_REFRESH_LANE_VERSION,
    laneId: lane.laneId,
    goal: lane.goal,
    operationVersion: lane.operationVersion,
    priority: lane.priority,
    priorityReasonCodes,
    predecessorLaneIds,
    resourceClaims,
    effect: lane.effect,
    ...(lane.approvalGateId === undefined
      ? {}
      : { approvalGateId: lane.approvalGateId }),
    requiredForPublication: lane.requiredForPublication,
    inputDigests,
    outputKinds,
  };
  return deepFreeze({
    ...core,
    laneDigest: taskMapContractDigest(core),
  });
}

function stageOfLane(lane: Pick<TaskMapRefreshLaneV1, "outputKinds">): LaneStage {
  const stages = new Set(lane.outputKinds.map((kind) => OUTPUT_STAGE[kind]));
  if (stages.size !== 1) {
    throw new Error("one refresh lane cannot emit contradictory stage output kinds");
  }
  return [...stages][0];
}

function derivedRequiredForPublication(stage: LaneStage): boolean {
  return stage !== "strategy_projection" && stage !== "audit";
}

function assertAcyclic(
  lanesById: ReadonlyMap<string, TaskMapRefreshLaneV1>,
): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (laneId: string): void => {
    if (visited.has(laneId)) return;
    if (visiting.has(laneId)) throw new Error("refresh lane graph contains a cycle");
    visiting.add(laneId);
    for (const predecessor of lanesById.get(laneId)!.predecessorLaneIds) {
      visit(predecessor);
    }
    visiting.delete(laneId);
    visited.add(laneId);
  };
  for (const laneId of lanesById.keys()) visit(laneId);
}

function ancestorsOf(
  laneId: string,
  lanesById: ReadonlyMap<string, TaskMapRefreshLaneV1>,
  memo: Map<string, Set<string>>,
): Set<string> {
  const cached = memo.get(laneId);
  if (cached) return cached;
  const ancestors = new Set<string>();
  for (const predecessor of lanesById.get(laneId)!.predecessorLaneIds) {
    ancestors.add(predecessor);
    for (const ancestor of ancestorsOf(predecessor, lanesById, memo)) {
      ancestors.add(ancestor);
    }
  }
  memo.set(laneId, ancestors);
  return ancestors;
}

function assertProviderLaneInputs(
  lane: TaskMapRefreshLaneV1,
  bindingDigest: string,
  priorProviderArtifacts:
    readonly TaskMapRefreshPriorProviderArtifactV1[],
): void {
  const expected = [bindingDigest];
  const priorArtifact = priorProviderArtifacts.find(
    (artifact) => artifact.bindingDigest === bindingDigest,
  );
  if (priorArtifact) {
    expected.push(
      priorArtifact.checkpointDigest,
      priorArtifact.sourceSliceDigest,
    );
  }
  const canonicalExpected = [...new Set(expected)].sort(compareText);
  if (!setEquals(lane.inputDigests, canonicalExpected)) {
    throw new Error(
      "provider lane input digests must equal its derived binding and prior artifacts",
    );
  }
}

function assertRawLaneArrayBounds(
  value: unknown,
): asserts value is TaskMapRefreshLaneDraftV1[] {
  if (
    !Array.isArray(value)
    || value.length === 0
    || value.length > MAX_LANES
  ) {
    throw new Error("refresh plan must contain a bounded non-empty lane set");
  }
  let totalResourceClaims = 0;
  let totalInputDigests = 0;
  let totalPredecessorEdges = 0;
  for (const item of value) {
    assertPlainObject(item, "refresh lane");
    const lane = item as Record<string, unknown>;
    if (
      !Array.isArray(lane.priorityReasonCodes)
      || lane.priorityReasonCodes.length === 0
      || lane.priorityReasonCodes.length
        > MAX_PRIORITY_REASON_CODES_PER_LANE
    ) {
      throw new Error(
        `priorityReasonCodes exceed the per-lane bound of ${MAX_PRIORITY_REASON_CODES_PER_LANE}`,
      );
    }
    if (
      !Array.isArray(lane.outputKinds)
      || lane.outputKinds.length === 0
      || lane.outputKinds.length > MAX_OUTPUT_KINDS_PER_LANE
    ) {
      throw new Error(
        `outputKinds exceed the per-lane bound of ${MAX_OUTPUT_KINDS_PER_LANE}`,
      );
    }
    if (!Array.isArray(lane.resourceClaims)) {
      throw new Error("resourceClaims must be a bounded array");
    }
    if (lane.resourceClaims.length === 0) {
      throw new Error(
        "resource claims must contain at least one resource claim",
      );
    }
    if (lane.resourceClaims.length > MAX_RESOURCE_CLAIMS_PER_LANE) {
      throw new Error(
        `resourceClaims exceed the per-lane bound of ${MAX_RESOURCE_CLAIMS_PER_LANE}`,
      );
    }
    if (
      !Array.isArray(lane.inputDigests)
      || lane.inputDigests.length > MAX_INPUT_DIGESTS_PER_LANE
    ) {
      throw new Error(
        `lane inputDigests exceed the per-lane bound of ${MAX_INPUT_DIGESTS_PER_LANE}`,
      );
    }
    if (
      !Array.isArray(lane.predecessorLaneIds)
      || lane.predecessorLaneIds.length > MAX_PREDECESSORS_PER_LANE
    ) {
      throw new Error(
        `predecessorLaneIds exceed the per-lane bound of ${MAX_PREDECESSORS_PER_LANE}`,
      );
    }
    totalResourceClaims += lane.resourceClaims.length;
    totalInputDigests += lane.inputDigests.length;
    totalPredecessorEdges += lane.predecessorLaneIds.length;
    if (totalResourceClaims > MAX_TOTAL_RESOURCE_CLAIMS) {
      throw new Error(
        `refresh plan exceeds ${MAX_TOTAL_RESOURCE_CLAIMS} total resource claims`,
      );
    }
    if (totalInputDigests > MAX_TOTAL_INPUT_DIGESTS) {
      throw new Error(
        `refresh plan exceeds ${MAX_TOTAL_INPUT_DIGESTS} total lane input digests`,
      );
    }
    if (totalPredecessorEdges > MAX_TOTAL_PREDECESSOR_EDGES) {
      throw new Error(
        `refresh plan exceeds ${MAX_TOTAL_PREDECESSOR_EDGES} predecessor edges`,
      );
    }
  }
}

function assertTopology(
  lanes: readonly TaskMapRefreshLaneV1[],
  sourceBindings: readonly TaskMapRefreshSourceBindingV1[],
  priorProviderArtifacts:
    readonly TaskMapRefreshPriorProviderArtifactV1[],
): void {
  if (lanes.length === 0 || lanes.length > MAX_LANES) {
    throw new Error("refresh plan must contain a bounded non-empty lane set");
  }
  const totalResourceClaims = lanes.reduce(
    (total, lane) => total + lane.resourceClaims.length,
    0,
  );
  if (totalResourceClaims > MAX_TOTAL_RESOURCE_CLAIMS) {
    throw new Error(
      `refresh plan exceeds ${MAX_TOTAL_RESOURCE_CLAIMS} total resource claims`,
    );
  }
  const totalInputDigests = lanes.reduce(
    (total, lane) => total + lane.inputDigests.length,
    0,
  );
  if (totalInputDigests > MAX_TOTAL_INPUT_DIGESTS) {
    throw new Error(
      `refresh plan exceeds ${MAX_TOTAL_INPUT_DIGESTS} total lane input digests`,
    );
  }
  const totalPredecessorEdges = lanes.reduce(
    (total, lane) => total + lane.predecessorLaneIds.length,
    0,
  );
  if (totalPredecessorEdges > MAX_TOTAL_PREDECESSOR_EDGES) {
    throw new Error(
      `refresh plan exceeds ${MAX_TOTAL_PREDECESSOR_EDGES} predecessor edges`,
    );
  }
  const lanesById = new Map<string, TaskMapRefreshLaneV1>();
  for (const lane of lanes) {
    if (lanesById.has(lane.laneId)) {
      throw new Error(`refresh lane ${lane.laneId} is duplicated`);
    }
    lanesById.set(lane.laneId, lane);
  }
  for (const lane of lanes) {
    if (lane.predecessorLaneIds.includes(lane.laneId)) {
      throw new Error("refresh lane cannot depend on itself");
    }
    for (const predecessor of lane.predecessorLaneIds) {
      if (!lanesById.has(predecessor)) {
        throw new Error(`refresh lane predecessor ${predecessor} is missing`);
      }
    }
    const stage = stageOfLane(lane);
    if (GOAL_STAGE[lane.goal] !== stage) {
      throw new Error("refresh lane goal must match its derived output stage");
    }
    if (
      (derivedRequiredForPublication(stage) && lane.priority !== "P0")
      || lane.priorityReasonCodes.some(
        (reason) => !STAGE_PRIORITY_REASONS[stage].has(reason),
      )
    ) {
      throw new Error(
        "refresh lane priority and reason codes are policy-derived from stage",
      );
    }
    const expectedRequired = derivedRequiredForPublication(stage);
    if (lane.requiredForPublication !== expectedRequired) {
      throw new Error(
        `${stage} requiredForPublication is policy-derived and cannot be overridden`,
      );
    }
  }
  assertAcyclic(lanesById);

  const stages = new Map<LaneStage, TaskMapRefreshLaneV1[]>();
  for (const lane of lanes) {
    const stage = stageOfLane(lane);
    const rows = stages.get(stage) ?? [];
    rows.push(lane);
    stages.set(stage, rows);
  }
  const collect = stages.get("collect") ?? [];
  const normalize = stages.get("normalize") ?? [];
  const barriers = stages.get("barrier") ?? [];
  const gates = stages.get("gate") ?? [];
  const taskMapProjections = stages.get("taskmap_projection") ?? [];
  const strategyProjections = stages.get("strategy_projection") ?? [];
  const publications = stages.get("publication") ?? [];
  if (collect.length === 0 || normalize.length === 0) {
    throw new Error("refresh topology requires source and normalization lanes");
  }
  if (barriers.length !== 1) {
    throw new Error("refresh topology requires exactly one identity/dedupe barrier");
  }
  if (gates.length === 0) {
    throw new Error("refresh topology requires deterministic gate lanes");
  }
  if (taskMapProjections.length === 0) {
    throw new Error("refresh topology requires a Task Map projection lane");
  }
  if (publications.length !== 1) {
    throw new Error("refresh topology requires exactly one publication lane");
  }

  const barrier = barriers[0];
  const normalizationIds = normalize.map((lane) => lane.laneId).sort(compareText);
  if (
    taskMapContractCanonicalJson(barrier.predecessorLaneIds)
    !== taskMapContractCanonicalJson(normalizationIds)
  ) {
    throw new Error(
      "identity/dedupe barrier must directly all-settle every normalization lane",
    );
  }

  const memo = new Map<string, Set<string>>();
  const barrierAncestors = ancestorsOf(barrier.laneId, lanesById, memo);
  for (const lane of collect) {
    if (!barrierAncestors.has(lane.laneId)) {
      throw new Error(
        "every source collection lane must feed the identity/dedupe barrier",
      );
    }
    for (const predecessor of lane.predecessorLaneIds) {
      if (stageOfLane(lanesById.get(predecessor)!) !== "collect") {
        throw new Error("source collection cannot depend on a later-stage lane");
      }
    }
  }
  for (const lane of normalize) {
    for (const predecessor of lane.predecessorLaneIds) {
      const predecessorStage = stageOfLane(lanesById.get(predecessor)!);
      if (predecessorStage !== "collect" && predecessorStage !== "normalize") {
        throw new Error("normalization cannot depend on a post-barrier lane");
      }
    }
  }
  const bindingDigests = new Set(
    sourceBindings.map((binding) => binding.bindingDigest),
  );
  const providerLanes = [...collect, ...normalize];
  const providerBindingByLaneId = new Map<string, string>();
  for (const lane of providerLanes) {
    const carriedBindings = lane.inputDigests.filter(
      (digest) => bindingDigests.has(digest),
    );
    if (carriedBindings.length !== 1) {
      throw new Error(
        "every provider lane must carry exactly one declared source binding",
      );
    }
    assertProviderLaneInputs(
      lane,
      carriedBindings[0],
      priorProviderArtifacts,
    );
    providerBindingByLaneId.set(lane.laneId, carriedBindings[0]);
  }

  for (const lane of providerLanes) {
    const laneBinding = providerBindingByLaneId.get(lane.laneId)!;
    for (const ancestorId of ancestorsOf(lane.laneId, lanesById, memo)) {
      const ancestor = lanesById.get(ancestorId)!;
      const ancestorStage = stageOfLane(ancestor);
      if (
        (ancestorStage === "collect" || ancestorStage === "normalize")
        && providerBindingByLaneId.get(ancestorId) !== laneBinding
      ) {
        throw new Error(
          "provider collect/normalize ancestry must remain binding-local until the identity barrier",
        );
      }
    }
  }

  for (const lane of normalize) {
    const ancestors = ancestorsOf(lane.laneId, lanesById, memo);
    const laneBinding = providerBindingByLaneId.get(lane.laneId)!;
    const sameBindingAncestor = collect.some((candidate) => (
      ancestors.has(candidate.laneId)
      && providerBindingByLaneId.get(candidate.laneId) === laneBinding
    ));
    if (!sameBindingAncestor) {
      throw new Error(
        "every normalization binding must descend from same-binding collection",
      );
    }
  }
  for (const binding of sourceBindings) {
    const collectionCoverage = collect.some((lane) => (
      lane.inputDigests.includes(binding.bindingDigest)
    ));
    const normalizationCoverage = normalize.some((lane) => (
      lane.inputDigests.includes(binding.bindingDigest)
    ));
    if (!collectionCoverage || !normalizationCoverage) {
      throw new Error(
        "every source binding must be represented in collection and normalization",
      );
    }
  }

  for (const lane of [
    ...gates,
    ...taskMapProjections,
    ...strategyProjections,
    ...publications,
  ]) {
    const ancestors = ancestorsOf(lane.laneId, lanesById, memo);
    if (!ancestors.has(barrier.laneId)) {
      throw new Error("all semantic and publication lanes must follow the barrier");
    }
    for (const predecessor of lane.predecessorLaneIds) {
      const predecessorStage = stageOfLane(lanesById.get(predecessor)!);
      if (predecessorStage === "collect" || predecessorStage === "normalize") {
        throw new Error("downstream lanes cannot consume pre-barrier outputs");
      }
    }
  }
  for (const projection of [...taskMapProjections, ...strategyProjections]) {
    const ancestors = ancestorsOf(projection.laneId, lanesById, memo);
    const missingGate = gates.find((gate) => !ancestors.has(gate.laneId));
    if (missingGate) {
      throw new Error("Task Map projection must wait for every deterministic gate");
    }
  }
  for (const lane of lanes.filter(
    (candidate) => candidate.requiredForPublication,
  )) {
    const ancestors = ancestorsOf(lane.laneId, lanesById, memo);
    const optionalAncestor = [...ancestors].find(
      (ancestorId) => !lanesById.get(ancestorId)!.requiredForPublication,
    );
    if (optionalAncestor) {
      throw new Error(
        "policy-required refresh lanes cannot depend on optional ancestors",
      );
    }
  }
  const publication = publications[0];
  const publicationAncestors = ancestorsOf(publication.laneId, lanesById, memo);
  for (const lane of lanes) {
    if (
      lane.requiredForPublication
      && lane.laneId !== publication.laneId
      && !publicationAncestors.has(lane.laneId)
    ) {
      throw new Error(
        "publication must transitively depend on every policy-required lane",
      );
    }
  }
}

function assertNoConflictingSameRevision(
  current: readonly TaskMapRefreshSourceRevisionV1[],
  accepted: readonly TaskMapRefreshSourceRevisionV1[],
): void {
  const acceptedByIdentity = new Map(
    accepted.map((revision) => [
      `${revision.bindingDigest}:${revision.sourceIdentityDigest}`,
      revision,
    ]),
  );
  for (const revision of current) {
    const prior = acceptedByIdentity.get(
      `${revision.bindingDigest}:${revision.sourceIdentityDigest}`,
    );
    if (
      prior
      && prior.sourceRevisionDigest === revision.sourceRevisionDigest
      && prior.contentDigest !== revision.contentDigest
    ) {
      throw new Error(
        "identical source identity and revision cannot change content digest",
      );
    }
  }
}

function assertSourceRevisionBindings(
  revisions: readonly TaskMapRefreshSourceRevisionV1[],
  sourceBindings: readonly TaskMapRefreshSourceBindingV1[],
  label: string,
): void {
  const declared = new Set(
    sourceBindings.map((binding) => binding.bindingDigest),
  );
  for (const revision of revisions) {
    if (!declared.has(revision.bindingDigest)) {
      throw new Error(`${label} references an undeclared source binding`);
    }
  }
}

function setEquals(left: readonly unknown[], right: readonly unknown[]): boolean {
  return taskMapContractCanonicalJson(left) === taskMapContractCanonicalJson(right);
}

function semanticImplementationDigestFor(
  sourceBindings: readonly TaskMapRefreshSourceBindingV1[],
  lanes: readonly TaskMapRefreshLaneV1[],
): string {
  const semanticLanes = lanes
    .filter((lane) => lane.requiredForPublication)
    .map((lane) => {
      const stage = stageOfLane(lane);
      const core = {
        contractVersion: lane.contractVersion,
        laneId: lane.laneId,
        goal: lane.goal,
        operationVersion: lane.operationVersion,
        predecessorLaneIds: lane.predecessorLaneIds,
        effect: lane.effect,
        approvalGateId: lane.approvalGateId,
        requiredForPublication: lane.requiredForPublication,
        outputKinds: lane.outputKinds,
      };
      if (stage === "collect" || stage === "normalize") {
        return {
          ...core,
          sourceBindingDigests: sourceBindings
            .filter((binding) => (
              lane.inputDigests.includes(binding.bindingDigest)
            ))
            .map((binding) => binding.bindingDigest)
            .sort(compareText),
        };
      }
      return { ...core, inputDigests: lane.inputDigests };
    });
  return taskMapContractDigest({
    sourceBindings,
    barrierPolicyVersion: TASKMAP_REFRESH_BARRIER_POLICY_VERSION,
    requirednessPolicyVersion: TASKMAP_REFRESH_REQUIREDNESS_POLICY_VERSION,
    semanticLanes,
  });
}

function buildTaskMapRefreshPlanFromSnapshot(
  draft: TaskMapRefreshPlanDraftV1,
): TaskMapRefreshPlanV1 {
  assertOnlyKeys(draft, PLAN_DRAFT_KEYS, "refresh plan draft");
  if (draft.contractVersion !== TASKMAP_REFRESH_PLAN_DRAFT_VERSION) {
    throw new Error("refresh plan draft contract version is unsupported");
  }
  assertDigest(draft.ownerScopeDigest, "ownerScopeDigest");
  const baseline = normalizeBaseline(draft.baseline);
  if (
    baseline.kind === "accepted"
    && baseline.priorOwnerScopeDigest !== draft.ownerScopeDigest
  ) {
    throw new Error("accepted refresh baseline cannot cross owner scope");
  }
  const reviewedDigests = normalizeReviewedDigests(draft.reviewedDigests);
  const reviewedEvidenceDigest = taskMapContractDigest(reviewedDigests);
  const sourceBindings = normalizeSourceBindings(draft.sourceBindings);
  const sourceRevisions = normalizeSourceRevisions(
    draft.sourceRevisions,
    "source revisions",
    true,
  );
  assertSourceRevisionBindings(
    sourceRevisions,
    sourceBindings,
    "source revision",
  );
  const sourceRevisionSets = normalizeSourceRevisionSets(
    draft.sourceRevisionSets,
    "source revision sets",
  );
  assertSourceRevisionSets(
    sourceRevisionSets,
    sourceRevisions,
    sourceBindings.map((binding) => binding.bindingDigest),
    "source revision sets",
  );
  const priorBindingDigests = baseline.priorProviderArtifacts.map(
    (artifact) => artifact.bindingDigest,
  );
  assertSourceRevisionSets(
    baseline.acceptedSourceRevisionSets,
    baseline.acceptedSourceRevisions,
    priorBindingDigests,
    "accepted source revision sets",
  );
  assertNoConflictingSameRevision(
    sourceRevisions,
    baseline.acceptedSourceRevisions,
  );
  const sourceRevisionDigests = [
    ...new Set(sourceRevisions.map((revision) => revision.sourceRevisionDigest)),
  ].sort(compareText);
  const semanticInputDigests = normalizeDigestSet(
    draft.semanticInputDigests,
    "semanticInputDigests",
  );
  assertDigest(draft.deterministicReplayDigest, "deterministicReplayDigest");
  const policyBindings = normalizePolicyBindings(draft.policyBindings);
  const policyBundleDigest = taskMapContractDigest(policyBindings);
  assertRawLaneArrayBounds(draft.lanes);
  const lanes = draft.lanes
    .map(normalizeLane)
    .sort((left, right) => compareText(left.laneId, right.laneId));
  assertTopology(
    lanes,
    sourceBindings,
    baseline.priorProviderArtifacts,
  );
  const semanticImplementationDigest = semanticImplementationDigestFor(
    sourceBindings,
    lanes,
  );

  const exactSourceMatch = setEquals(
    sourceRevisions,
    baseline.acceptedSourceRevisions,
  ) && setEquals(
    sourceRevisionSets,
    baseline.acceptedSourceRevisionSets,
  );
  const exactSemanticInputMatch = setEquals(
    semanticInputDigests,
    baseline.acceptedSemanticInputDigests,
  );
  const exactReplayMatch = (
    baseline.acceptedDeterministicReplayDigest
    === draft.deterministicReplayDigest
  );
  const exactReviewedMatch = (
    baseline.priorReviewedEvidenceDigest === reviewedEvidenceDigest
  );
  const exactPolicyMatch = (
    baseline.priorPolicyBundleDigest === policyBundleDigest
  );
  const exactSemanticImplementationMatch = (
    baseline.priorSemanticImplementationDigest
    === semanticImplementationDigest
  );
  const isExactNoOp = (
    baseline.kind === "accepted"
    && exactSourceMatch
    && exactSemanticInputMatch
    && exactReplayMatch
    && exactReviewedMatch
    && exactPolicyMatch
    && exactSemanticImplementationMatch
  );
  const refreshReasonCodes: TaskMapRefreshReasonCode[] = isExactNoOp
    ? ["exact_source_input_replay_match"]
    : [
      ...(baseline.kind === "genesis" ? ["genesis" as const] : []),
      ...(!exactSourceMatch ? ["source_revision_changed" as const] : []),
      ...(!exactSemanticInputMatch ? ["semantic_input_changed" as const] : []),
      ...(!exactReplayMatch ? ["deterministic_replay_changed" as const] : []),
      ...(!exactReviewedMatch ? ["reviewed_evidence_changed" as const] : []),
      ...(!exactPolicyMatch ? ["policy_bundle_changed" as const] : []),
      ...(!exactSemanticImplementationMatch
        ? ["semantic_implementation_changed" as const]
        : []),
    ].sort(compareText);
  const computedCandidateAcceptedStateDigest = taskMapContractDigest({
    ownerScopeDigest: draft.ownerScopeDigest,
    sourceRevisions,
    sourceRevisionSets,
    semanticInputDigests,
    deterministicReplayDigest: draft.deterministicReplayDigest,
    reviewedEvidenceDigest,
    policyBundleDigest,
    semanticImplementationDigest,
    privacy: PRIVACY,
  });
  const candidateAcceptedStateDigest = isExactNoOp
    ? baseline.priorAcceptedStateDigest!
    : computedCandidateAcceptedStateDigest;

  const core = {
    ownerScopeDigest: draft.ownerScopeDigest,
    baseline,
    reviewedDigests,
    reviewedEvidenceDigest,
    sourceBindings,
    sourceRevisions,
    sourceRevisionSets,
    sourceRevisionDigests,
    semanticInputDigests,
    deterministicReplayDigest: draft.deterministicReplayDigest,
    policyBindings,
    policyBundleDigest,
    semanticImplementationDigest,
    barrierPolicyVersion: TASKMAP_REFRESH_BARRIER_POLICY_VERSION,
    requirednessPolicyVersion: TASKMAP_REFRESH_REQUIREDNESS_POLICY_VERSION,
    schedulingPolicyVersion: TASKMAP_REFRESH_SCHEDULING_POLICY_VERSION,
    lanes,
    candidateAcceptedStateDigest,
    isExactNoOp,
    refreshReasonCodes,
    privacy: { ...PRIVACY },
  };
  const identityInput = {
    contractVersion: TASKMAP_REFRESH_PLAN_VERSION,
    ...core,
  };
  const builtPlan = {
    contractVersion: TASKMAP_REFRESH_PLAN_VERSION,
    planId: stableId("tmrefreshplan", identityInput),
    ...core,
  };
  const canonicalPlanBytes = Buffer.byteLength(
    taskMapContractCanonicalJson(builtPlan),
    "utf8",
  );
  if (canonicalPlanBytes > MAX_CANONICAL_PLAN_BYTES) {
    throw new Error(
      `canonical refresh plan exceeds ${MAX_CANONICAL_PLAN_BYTES} bytes`,
    );
  }
  return deepFreeze(builtPlan);
}

export function buildTaskMapRefreshPlan(
  draft: TaskMapRefreshPlanDraftV1,
): TaskMapRefreshPlanV1 {
  return buildTaskMapRefreshPlanFromSnapshot(
    snapshotJsonInput(draft, "refresh plan draft"),
  );
}

function planToDraft(plan: TaskMapRefreshPlanV1): TaskMapRefreshPlanDraftV1 {
  return {
    contractVersion: TASKMAP_REFRESH_PLAN_DRAFT_VERSION,
    ownerScopeDigest: plan.ownerScopeDigest,
    baseline: plan.baseline,
    reviewedDigests: plan.reviewedDigests,
    sourceBindings: plan.sourceBindings,
    sourceRevisions: plan.sourceRevisions,
    sourceRevisionSets: plan.sourceRevisionSets,
    semanticInputDigests: plan.semanticInputDigests,
    deterministicReplayDigest: plan.deterministicReplayDigest,
    policyBindings: plan.policyBindings,
    lanes: plan.lanes.map(({ laneDigest: _laneDigest, ...lane }) => (
      lane
    )),
  };
}

function assertRawBuiltPlanArrayBounds(value: unknown): void {
  assertPlainObject(value, "built refresh plan");
  const plan = value as Record<string, unknown>;
  assertRawLaneArrayBounds(plan.lanes);
  for (const [key, maxItems] of [
    ["sourceBindings", MAX_SET_ITEMS],
    ["sourceRevisions", MAX_SET_ITEMS],
    ["sourceRevisionSets", MAX_SET_ITEMS],
    ["sourceRevisionDigests", MAX_SET_ITEMS],
    ["semanticInputDigests", MAX_SET_ITEMS],
    ["policyBindings", MAX_SET_ITEMS],
    ["refreshReasonCodes", MAX_PRIORITY_REASON_CODES_PER_LANE],
  ] as const) {
    const item = plan[key];
    if (!Array.isArray(item) || item.length > maxItems) {
      throw new Error(
        `built refresh plan ${key} exceeds its raw array bound of ${maxItems}`,
      );
    }
  }
  assertOnlyKeys(plan.baseline, BASELINE_KEYS, "refresh baseline");
  const baseline = plan.baseline as Record<string, unknown>;
  for (const key of [
    "priorCheckpointDigests",
    "priorSourceSliceDigests",
    "priorProviderArtifacts",
    "acceptedSourceRevisions",
    "acceptedSourceRevisionSets",
    "acceptedSemanticInputDigests",
  ] as const) {
    const item = baseline[key];
    if (!Array.isArray(item) || item.length > MAX_SET_ITEMS) {
      throw new Error(
        `built refresh baseline ${key} exceeds its raw array bound of ${MAX_SET_ITEMS}`,
      );
    }
  }
}

function assertDescriptorFirstJsonPreflight(
  value: unknown,
  label: string,
): void {
  let rawBytes = 0;
  let rawNodes = 0;
  const visiting = new WeakSet<object>();
  const addNode = (): void => {
    rawNodes += 1;
    if (rawNodes > MAX_RAW_NODES) {
      throw new Error(
        `${label} exceeds raw node budget ${MAX_RAW_NODES}`,
      );
    }
  };
  const addBytes = (itemBytes: number): void => {
    rawBytes += itemBytes;
    if (rawBytes > MAX_CANONICAL_PLAN_BYTES) {
      throw new Error(
        `${label} raw byte budget exceeds ${MAX_CANONICAL_PLAN_BYTES} bytes`,
      );
    }
  };
  const addString = (item: string): void => {
    if (item.length > MAX_RAW_STRING_BYTES) {
      throw new Error(
        `${label} raw string exceeds ${MAX_RAW_STRING_BYTES} bytes`,
      );
    }
    const itemBytes = Buffer.byteLength(item, "utf8");
    if (itemBytes > MAX_RAW_STRING_BYTES) {
      throw new Error(
        `${label} raw string exceeds ${MAX_RAW_STRING_BYTES} bytes`,
      );
    }
    addBytes(itemBytes);
  };
  const visit = (item: unknown, depth: number): void => {
    addNode();
    if (typeof item === "string") {
      addString(item);
      return;
    }
    if (
      item === null
      || typeof item === "boolean"
      || typeof item === "number"
    ) {
      if (typeof item === "number" && !Number.isFinite(item)) {
        throw new Error(`${label} must contain finite JSON numbers`);
      }
      addBytes(item === null ? 4 : typeof item === "boolean" ? 5 : 32);
      return;
    }
    if (typeof item !== "object") {
      throw new Error(`${label} must contain JSON data values`);
    }
    if (depth > MAX_RAW_NESTING_DEPTH) {
      throw new Error(
        `${label} exceeds raw nesting depth ${MAX_RAW_NESTING_DEPTH}`,
      );
    }
    if (visiting.has(item)) {
      throw new Error(`${label} cannot contain cyclic values`);
    }
    visiting.add(item);
    if (Array.isArray(item)) {
      if (Object.getPrototypeOf(item) !== Array.prototype) {
        throw new Error(`${label} arrays must be plain data`);
      }
      const lengthDescriptor = Object.getOwnPropertyDescriptor(
        item,
        "length",
      );
      if (
        !lengthDescriptor
        || !("value" in lengthDescriptor)
        || typeof lengthDescriptor.value !== "number"
        || !Number.isSafeInteger(lengthDescriptor.value)
        || lengthDescriptor.value < 0
      ) {
        throw new Error(`${label} arrays require a data length`);
      }
      const arrayLength = lengthDescriptor.value;
      if (arrayLength > MAX_RAW_NODES - rawNodes) {
        throw new Error(
          `${label} exceeds raw node budget ${MAX_RAW_NODES}`,
        );
      }
      let enumerableElementKeys = 0;
      for (const key in item) {
        if (!Object.prototype.hasOwnProperty.call(item, key)) continue;
        if (
          !/^(?:0|[1-9][0-9]*)$/.test(key)
          || Number(key) >= arrayLength
        ) {
          throw new Error(`${label} arrays cannot carry extra properties`);
        }
        enumerableElementKeys += 1;
        if (enumerableElementKeys > arrayLength) {
          throw new Error(
            `${label} arrays cannot contain holes or hidden elements`,
          );
        }
      }
      if (enumerableElementKeys !== arrayLength) {
        throw new Error(
          `${label} arrays cannot contain holes or hidden elements`,
        );
      }
      // JavaScript exposes hidden and symbol keys only through allocating APIs.
      // The enumerable prepass bounds ordinary hostile objects first; the
      // remaining same-process hidden/symbol key count is an explicit trust
      // boundary and is still rejected immediately after this allocation.
      const ownKeys = Reflect.ownKeys(item);
      if (ownKeys.some((key) => typeof key === "symbol")) {
        throw new Error(
          `${label} cannot contain symbol-keyed values`,
        );
      }
      let elementKeys = 0;
      for (const rawKey of ownKeys) {
        const key = rawKey as string;
        if (key === "length") continue;
        if (
          !/^(?:0|[1-9][0-9]*)$/.test(key)
          || Number(key) >= arrayLength
        ) {
          throw new Error(
            `${label} arrays cannot carry extra properties`,
          );
        }
        const descriptor = Object.getOwnPropertyDescriptor(
          item,
          key,
        );
        if (!descriptor || !("value" in descriptor)) {
          throw new Error(
            `${label} cannot contain accessor-backed values`,
          );
        }
        if (!descriptor.enumerable) {
          throw new Error(
            `${label} arrays cannot contain holes or hidden elements`,
          );
        }
        elementKeys += 1;
        visit(descriptor.value, depth + 1);
      }
      if (elementKeys !== arrayLength) {
        throw new Error(
          `${label} arrays cannot contain holes or hidden elements`,
        );
      }
    } else {
      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new Error(`${label} objects must be plain data`);
      }
      let enumerableOwnKeys = 0;
      for (const key in item) {
        if (!Object.prototype.hasOwnProperty.call(item, key)) continue;
        enumerableOwnKeys += 1;
        if (enumerableOwnKeys > MAX_RAW_OBJECT_KEYS) {
          throw new Error(
            `${label} object exceeds ${MAX_RAW_OBJECT_KEYS} keys`,
          );
        }
      }
      // See the array note above: enumerable attacker width is bounded before
      // Reflect.ownKeys. Hidden/symbol keys are a same-process trust boundary,
      // not something ECMAScript lets this validator count allocation-free.
      const ownKeys = Reflect.ownKeys(item);
      if (ownKeys.length > MAX_RAW_OBJECT_KEYS) {
        throw new Error(
          `${label} object exceeds ${MAX_RAW_OBJECT_KEYS} keys`,
        );
      }
      for (const key of ownKeys) {
        if (typeof key === "symbol") {
          throw new Error(
            `${label} cannot contain symbol-keyed values`,
          );
        }
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor || !("value" in descriptor)) {
          throw new Error(
            `${label} cannot contain accessor-backed values`,
          );
        }
        if (!descriptor.enumerable) {
          throw new Error(
            `${label} objects cannot contain hidden properties`,
          );
        }
        addString(key);
        visit(descriptor.value, depth + 1);
      }
    }
    visiting.delete(item);
  };
  visit(value, 0);
}

function clonePreflightedInputs<T>(value: T, label: string): T {
  try {
    return structuredClone(value);
  } catch {
    throw new Error(
      `${label} cannot be snapshotted as plain JSON data`,
    );
  }
}

function snapshotJsonInput<T>(value: T, label: string): T {
  assertDescriptorFirstJsonPreflight(value, label);
  return clonePreflightedInputs(value, label);
}

function assertTaskMapRefreshPlanFromSnapshot(
  value: TaskMapRefreshPlanV1,
): TaskMapRefreshPlanV1 {
  assertOnlyKeys(value, PLAN_KEYS, "built refresh plan");
  if (value.contractVersion !== TASKMAP_REFRESH_PLAN_VERSION) {
    throw new Error("built refresh plan contract version is unsupported");
  }
  assertRawBuiltPlanArrayBounds(value);
  for (const lane of value.lanes) {
    assertOnlyKeys(lane, BUILT_LANE_KEYS, "built refresh lane");
  }
  const rebuilt = buildTaskMapRefreshPlanFromSnapshot(planToDraft(value));
  if (taskMapContractCanonicalJson(rebuilt) !== taskMapContractCanonicalJson(value)) {
    throw new Error("built refresh plan is not canonical or has invalid derived fields");
  }
  return rebuilt;
}

export function assertTaskMapRefreshPlan(
  value: TaskMapRefreshPlanV1,
): TaskMapRefreshPlanV1 {
  return assertTaskMapRefreshPlanFromSnapshot(
    snapshotJsonInput(value, "built refresh plan"),
  );
}

function normalizeLaneStates(
  value: unknown,
  plan: TaskMapRefreshPlanV1,
): TaskMapRefreshLaneStateV1[] {
  if (!Array.isArray(value) || value.length > MAX_LANES) {
    throw new Error("laneStates must be a bounded array");
  }
  const lanesById = new Map(plan.lanes.map((lane) => [lane.laneId, lane]));
  const byLaneId = new Map<string, TaskMapRefreshLaneStateV1>();
  for (const item of value) {
    assertOnlyKeys(item, LANE_STATE_KEYS, "refresh lane state");
    const state = item as unknown as TaskMapRefreshLaneStateV1;
    assertSafeIdentifier(state.laneId, "lane state laneId");
    const lane = lanesById.get(state.laneId);
    if (!lane) throw new Error(`refresh lane state ${state.laneId} is extra`);
    if (byLaneId.has(state.laneId)) {
      throw new Error(`refresh lane state ${state.laneId} is duplicated`);
    }
    if (!VALID_LANE_STATUSES.has(state.status)) {
      throw new Error("refresh lane status is unknown");
    }
    if (
      lane.effect === "external_mutation"
      && state.status !== "absent"
      && state.status !== "pending"
    ) {
      throw new Error(
        "external mutation history requires unavailable receipt authority",
      );
    }
    const normalized: TaskMapRefreshLaneStateV1 = {
      laneId: state.laneId,
      status: state.status,
    };
    const hasFailureFields = (
      state.lastGoodCheckpointDigest !== undefined
      || state.lastGoodSourceSliceDigest !== undefined
      || state.errorCode !== undefined
      || state.errorDetailDigest !== undefined
    );
    if (state.status === "partial" || state.status === "failed" || state.status === "skipped") {
      assertSafeIdentifier(state.errorCode, "lane errorCode");
      if (!VALID_ERROR_CODES.has(state.errorCode)) {
        throw new Error("refresh lane errorCode is unknown");
      }
      assertCompatibleLaneErrorCode(
        stageOfLane(lane),
        state.status,
        state.errorCode,
      );
      assertDigest(state.errorDetailDigest, "lane errorDetailDigest");
      normalized.errorCode = state.errorCode;
      normalized.errorDetailDigest = state.errorDetailDigest;
      const stage = stageOfLane(lane);
      if (stage === "collect" || stage === "normalize") {
        const bindingDigest = plan.sourceBindings.find((binding) => (
          lane.inputDigests.includes(binding.bindingDigest)
        ))!.bindingDigest;
        const priorArtifact = plan.baseline.priorProviderArtifacts.find(
          (artifact) => artifact.bindingDigest === bindingDigest,
        );
        const hasCheckpoint = state.lastGoodCheckpointDigest !== undefined;
        const hasSourceSlice = state.lastGoodSourceSliceDigest !== undefined;
        if (hasCheckpoint !== hasSourceSlice) {
          throw new Error(
            "provider failure must retain both last-good refs or neither at genesis",
          );
        }
        if (hasCheckpoint && hasSourceSlice) {
          assertDigest(
            state.lastGoodCheckpointDigest,
            "lastGoodCheckpointDigest",
          );
          assertDigest(
            state.lastGoodSourceSliceDigest,
            "lastGoodSourceSliceDigest",
          );
          if (
            priorArtifact === undefined
            || priorArtifact.checkpointDigest
              !== state.lastGoodCheckpointDigest
            || priorArtifact.sourceSliceDigest
              !== state.lastGoodSourceSliceDigest
            || !lane.inputDigests.includes(state.lastGoodCheckpointDigest)
            || !lane.inputDigests.includes(state.lastGoodSourceSliceDigest)
          ) {
            throw new Error(
              "failed provider lane must retain its lane-bound full last-good checkpoint and source slice",
            );
          }
          normalized.lastGoodCheckpointDigest = state.lastGoodCheckpointDigest;
          normalized.lastGoodSourceSliceDigest = state.lastGoodSourceSliceDigest;
        } else if (priorArtifact !== undefined) {
          throw new Error(
            "provider failure requires its binding-paired last-good artifacts",
          );
        }
      } else if (
        state.lastGoodCheckpointDigest !== undefined
        || state.lastGoodSourceSliceDigest !== undefined
      ) {
        throw new Error("non-provider lane cannot claim provider last-good artifacts");
      }
    } else if (hasFailureFields) {
      throw new Error("non-failed lane state cannot carry failure or last-good fields");
    }
    byLaneId.set(state.laneId, normalized);
  }
  for (const lane of plan.lanes) {
    if (!byLaneId.has(lane.laneId)) {
      byLaneId.set(lane.laneId, {
        laneId: lane.laneId,
        status: "absent",
      });
    }
  }
  const normalizedStates = [...byLaneId.values()].sort((left, right) => (
    compareText(left.laneId, right.laneId)
  ));
  assertLaneStateTopology(plan, normalizedStates);
  return normalizedStates;
}

function providerStateIsUsable(state: TaskMapRefreshLaneStateV1): boolean {
  return (
    state.status === "succeeded"
    || (
      SETTLED_STATUSES.has(state.status)
      && state.lastGoodCheckpointDigest !== undefined
      && state.lastGoodSourceSliceDigest !== undefined
    )
  );
}

function assertCompatibleLaneErrorCode(
  stage: LaneStage,
  status: "partial" | "failed" | "skipped",
  errorCode: TaskMapRefreshErrorCode,
): void {
  const allowed = status === "skipped"
    ? (["upstream_unusable"] as const)
    : status === "partial"
      ? PARTIAL_ERROR_CODES_BY_STAGE[stage]
      : FAILURE_ERROR_CODES_BY_STAGE[stage];
  if (!allowed.some((candidate) => candidate === errorCode)) {
    throw new Error(
      "refresh lane errorCode is incompatible with its stage and status",
    );
  }
}

function assertLaneStateTopology(
  plan: TaskMapRefreshPlanV1,
  states: readonly TaskMapRefreshLaneStateV1[],
): void {
  const statesByLaneId = new Map(states.map((state) => [state.laneId, state]));
  const providerLanes = plan.lanes.filter((lane) => {
    const stage = stageOfLane(lane);
    return stage === "collect" || stage === "normalize";
  });
  for (const lane of plan.lanes) {
    const state = statesByLaneId.get(lane.laneId)!;
    if (state.status === "absent" || state.status === "pending") continue;
    const stage = stageOfLane(lane);
    if (stage === "barrier") {
      if (state.status === "skipped") {
        const predecessorStates = lane.predecessorLaneIds.map(
          (predecessor) => statesByLaneId.get(predecessor)!,
        );
        if (!providerLanes.every((provider) => (
          SETTLED_STATUSES.has(statesByLaneId.get(provider.laneId)!.status)
        ))) {
          throw new Error(
            "skipped identity barrier requires terminal provider histories",
          );
        }
        if (
          predecessorStates.length === 0
          || !predecessorStates.some(
            (predecessor) => predecessor.status !== "succeeded",
          )
        ) {
          throw new Error(
            "skipped identity barrier requires a terminal non-succeeded predecessor",
          );
        }
      } else if (!providerLanes.every((provider) => (
        providerStateIsUsable(statesByLaneId.get(provider.laneId)!)
      ))) {
        throw new Error(
          "active identity barrier requires usable all-settled provider histories",
        );
      }
      continue;
    }
    const predecessorStates = lane.predecessorLaneIds.map(
      (predecessor) => statesByLaneId.get(predecessor)!,
    );
    if (state.status === "skipped") {
      if (predecessorStates.length === 0) {
        throw new Error(
          "predecessor-free refresh lanes cannot be skipped",
        );
      }
      if (!predecessorStates.every((predecessor) => (
        SETTLED_STATUSES.has(predecessor.status)
      ))) {
        throw new Error(
          "skipped refresh lane requires terminal predecessor histories",
        );
      }
      if (!predecessorStates.some(
        (predecessor) => predecessor.status !== "succeeded",
      )) {
        throw new Error(
          "skipped refresh lane requires a terminal non-succeeded predecessor",
        );
      }
    } else if (!predecessorStates.every(
      (predecessor) => predecessor.status === "succeeded",
    )) {
      throw new Error(
        "active refresh lane requires every predecessor to have succeeded",
      );
    }
  }
}

function claimsConflict(
  left: Pick<TaskMapResourceClaimV1, "resourceId" | "mode">,
  right: Pick<TaskMapResourceClaimV1, "resourceId" | "mode">,
): boolean {
  return (
    left.resourceId === right.resourceId
    && (left.mode === "exclusive" || right.mode === "exclusive")
  );
}

function activeClaimsFor(
  plan: TaskMapRefreshPlanV1,
  states: readonly TaskMapRefreshLaneStateV1[],
): TaskMapActiveResourceClaimV1[] {
  const running = new Set(
    states
      .filter((state) => state.status === "running")
      .map((state) => state.laneId),
  );
  const activeClaims = plan.lanes
    .filter((lane) => running.has(lane.laneId))
    .flatMap((lane) => lane.resourceClaims.map((claim) => ({
      laneId: lane.laneId,
      ...claim,
    })));
  if (activeClaims.length > MAX_TOTAL_RESOURCE_CLAIMS) {
    throw new Error("active refresh claims exceed the aggregate claim bound");
  }
  const byResourceId = new Map<string, TaskMapActiveResourceClaimV1>();
  for (const claim of activeClaims) {
    const existing = byResourceId.get(claim.resourceId);
    if (
      existing
      && existing.laneId !== claim.laneId
      && claimsConflict(existing, claim)
    ) {
      throw new Error("already-running refresh lanes hold conflicting claims");
    }
    if (!existing || claim.mode === "exclusive") {
      byResourceId.set(claim.resourceId, claim);
    }
  }
  return activeClaims;
}

function claimReservationIndex(
  claims: readonly Pick<TaskMapResourceClaimV1, "resourceId" | "mode">[],
): Map<string, TaskMapResourceClaimMode> {
  const reservations = new Map<string, TaskMapResourceClaimMode>();
  for (const claim of claims) {
    const existing = reservations.get(claim.resourceId);
    if (existing === undefined || claim.mode === "exclusive") {
      reservations.set(claim.resourceId, claim.mode);
    }
  }
  return reservations;
}

function publicationFor(
  plan: TaskMapRefreshPlanV1,
  states: readonly TaskMapRefreshLaneStateV1[],
): TaskMapRefreshPublicationV1 {
  const stateByLaneId = new Map(states.map((state) => [state.laneId, state]));
  const publicationLane = plan.lanes.find(
    (lane) => stageOfLane(lane) === "publication",
  )!;
  const required = plan.lanes.filter((lane) => lane.requiredForPublication);
  const blockingReasons = new Set<TaskMapPublicationReasonCode>();
  if (required.some((lane) => lane.effect === "external_mutation")) {
    blockingReasons.add("approval_authority_unavailable");
  }
  for (const lane of required) {
    const status = stateByLaneId.get(lane.laneId)!.status;
    if (status === "absent") blockingReasons.add("required_lane_absent");
    if (status === "partial") blockingReasons.add("required_lane_partial");
    if (status === "failed") blockingReasons.add("required_lane_failed");
    if (status === "skipped") blockingReasons.add("required_lane_skipped");
  }
  let state: TaskMapPublicationState;
  let eligible = false;
  const reasons = new Set<TaskMapPublicationReasonCode>(blockingReasons);
  const publicationStatus = stateByLaneId.get(publicationLane.laneId)!.status;
  if (blockingReasons.size > 0) {
    state = "blocked";
  } else if (plan.isExactNoOp) {
    state = "no_op";
    reasons.add("exact_replay_no_op");
  } else if (publicationStatus === "succeeded") {
    state = "complete";
    reasons.add("publication_complete");
  } else if (publicationStatus === "running") {
    state = "running";
    reasons.add("publication_running");
  } else {
    const prerequisites = required.filter((lane) => lane.laneId !== publicationLane.laneId);
    for (const lane of prerequisites) {
      const status = stateByLaneId.get(lane.laneId)!.status;
      if (status === "pending") reasons.add("required_lane_pending");
      if (status === "running") reasons.add("required_lane_running");
    }
    const allSucceeded = prerequisites.every((lane) => (
      stateByLaneId.get(lane.laneId)!.status === "succeeded"
    ));
    if (allSucceeded && publicationStatus === "pending") {
      state = "ready";
      eligible = true;
      reasons.add("publication_ready");
    } else {
      state = "waiting";
      if (publicationStatus === "pending") reasons.add("required_lane_pending");
      if (publicationStatus === "absent") reasons.add("required_lane_absent");
    }
  }
  return {
    state,
    eligible,
    reasonCodes: [...reasons].sort(compareText),
    ...(plan.baseline.priorAcceptedStateDigest === undefined
      ? {}
      : {
          priorAcceptedStateDigest:
            plan.baseline.priorAcceptedStateDigest,
        }),
    candidateAcceptedStateDigest: plan.candidateAcceptedStateDigest,
    preservesPriorAcceptedState: true,
  };
}

function priorityValue(priority: TaskMapRefreshPriority): number {
  return priority === "P0" ? 0 : priority === "P1" ? 1 : 2;
}

function laneIsReady(
  lane: TaskMapRefreshLaneV1,
  statesByLaneId: ReadonlyMap<string, TaskMapRefreshLaneStateV1>,
  plan: TaskMapRefreshPlanV1,
): boolean {
  if (statesByLaneId.get(lane.laneId)!.status !== "pending") return false;
  // P10.1A has no receipt-scoped execution authority. A syntactically gated
  // external mutation may be represented in the static plan, but this pure
  // selector must never authorize or schedule it.
  if (lane.effect === "external_mutation") return false;
  if (stageOfLane(lane) === "barrier") {
    return plan.lanes
      .filter((candidate) => {
        const stage = stageOfLane(candidate);
        return stage === "collect" || stage === "normalize";
      })
      .every((predecessor) => (
        providerStateIsUsable(statesByLaneId.get(predecessor.laneId)!)
      ));
  }
  return lane.predecessorLaneIds.every((predecessor) => (
    statesByLaneId.get(predecessor)!.status === "succeeded"
  ));
}

function selectTaskMapReadyBatchFromSnapshot(
  planSnapshot: TaskMapRefreshPlanV1,
  selection: TaskMapRefreshSelectionDraftV1,
): TaskMapReadyBatchV1 {
  assertOnlyKeys(selection, SELECTION_KEYS, "refresh batch selection");
  if (
    !Array.isArray(selection.laneStates)
    || selection.laneStates.length > MAX_LANES
  ) {
    throw new Error("laneStates must be a bounded array");
  }
  if (
    typeof selection.maxConcurrency !== "number"
    || !Number.isInteger(selection.maxConcurrency)
    || !Number.isFinite(selection.maxConcurrency)
    || selection.maxConcurrency < 1
    || selection.maxConcurrency > MAX_CONCURRENCY
  ) {
    throw new Error(`maxConcurrency must be an integer from 1 to ${MAX_CONCURRENCY}`);
  }
  const plan = assertTaskMapRefreshPlanFromSnapshot(planSnapshot);
  const laneStates = normalizeLaneStates(selection.laneStates, plan);
  const stateByLaneId = new Map(laneStates.map((state) => [state.laneId, state]));
  const runningCount = laneStates.filter((state) => state.status === "running").length;
  if (runningCount > selection.maxConcurrency) {
    throw new Error("already-running lanes exceed maxConcurrency");
  }
  const activeClaims = activeClaimsFor(plan, laneStates);
  const publication = publicationFor(plan, laneStates);
  const capacity = Math.max(0, selection.maxConcurrency - runningCount);
  const reservations = claimReservationIndex(activeClaims);
  const selectedLaneIds: string[] = [];

  if (capacity > 0) {
    const ready = plan.lanes
      .filter((lane) => laneIsReady(lane, stateByLaneId, plan))
      .filter((lane) => !plan.isExactNoOp || !lane.requiredForPublication)
      .filter((lane) => (
        stageOfLane(lane) !== "publication" || publication.eligible
      ))
      .sort((left, right) => (
        priorityValue(left.priority) - priorityValue(right.priority)
        || compareText(left.laneId, right.laneId)
      ));
    for (const lane of ready) {
      if (selectedLaneIds.length >= capacity) break;
      const conflict = lane.resourceClaims.some((claim) => {
        const reservedMode = reservations.get(claim.resourceId);
        return (
          reservedMode !== undefined
          && (claim.mode === "exclusive" || reservedMode === "exclusive")
        );
      });
      if (conflict) continue;
      selectedLaneIds.push(lane.laneId);
      for (const claim of lane.resourceClaims) {
        if (!reservations.has(claim.resourceId)) {
          reservations.set(claim.resourceId, claim.mode);
        }
      }
    }
  }

  const core = {
    planId: plan.planId,
    candidateAcceptedStateDigest: plan.candidateAcceptedStateDigest,
    maxConcurrency: selection.maxConcurrency,
    laneStates,
    activeClaims,
    selectedLaneIds,
    publication,
  };
  return deepFreeze({
    contractVersion: TASKMAP_REFRESH_BATCH_VERSION,
    batchId: stableId("tmrefreshbatch", {
      contractVersion: TASKMAP_REFRESH_BATCH_VERSION,
      ...core,
    }),
    ...core,
  });
}

export function selectTaskMapReadyBatch(
  untrustedPlan: TaskMapRefreshPlanV1,
  selection: TaskMapRefreshSelectionDraftV1,
): TaskMapReadyBatchV1 {
  assertDescriptorFirstJsonPreflight(
    untrustedPlan,
    "built refresh plan",
  );
  assertDescriptorFirstJsonPreflight(
    selection,
    "refresh batch selection",
  );
  const inputSnapshot = clonePreflightedInputs(
    { plan: untrustedPlan, selection },
    "refresh batch selection input",
  );
  return selectTaskMapReadyBatchFromSnapshot(
    inputSnapshot.plan,
    inputSnapshot.selection,
  );
}

export function assertTaskMapReadyBatch(
  untrustedPlan: TaskMapRefreshPlanV1,
  value: TaskMapReadyBatchV1,
): TaskMapReadyBatchV1 {
  assertDescriptorFirstJsonPreflight(
    untrustedPlan,
    "built refresh plan",
  );
  assertDescriptorFirstJsonPreflight(
    value,
    "refresh ready batch",
  );
  const inputSnapshot = clonePreflightedInputs(
    { plan: untrustedPlan, batch: value },
    "refresh ready batch assertion input",
  );
  const batch = inputSnapshot.batch;
  assertOnlyKeys(batch, READY_BATCH_KEYS, "refresh ready batch");
  if (batch.contractVersion !== TASKMAP_REFRESH_BATCH_VERSION) {
    throw new Error("refresh ready batch contract version is unsupported");
  }
  const rebuilt = selectTaskMapReadyBatchFromSnapshot(
    inputSnapshot.plan,
    {
      maxConcurrency: batch.maxConcurrency,
      laneStates: batch.laneStates,
    },
  );
  if (
    taskMapContractCanonicalJson(rebuilt)
    !== taskMapContractCanonicalJson(batch)
  ) {
    throw new Error(
      "refresh ready batch is not canonical or has invalid derived fields",
    );
  }
  return rebuilt;
}
