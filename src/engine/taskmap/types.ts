import type { EnrichmentGateInput, EnrichmentGateResult } from "../reasoner/EnrichmentGate.js";

/**
 * Task Map is a read-only index over source-owned work. These types are kept
 * separate from GraphDelta: causal evidence and operational work do not share
 * identity or edge semantics.
 */

export const TASKMAP_CONTRACT_VERSION = "taskmap.v1" as const;
export const TASKMAP_ALGORITHM_POLICY_VERSION = "taskmap-policy.2" as const;
export const TASKMAP_SOURCE_ENVELOPE_VERSION = "taskmap-source-envelope.v1" as const;
export const TASKMAP_DISCOVERY_POINTER_VERSION = "taskmap-discovery-pointer.v1" as const;
export const TASKMAP_CONNECTOR_CHECKPOINT_VERSION = "taskmap-connector-checkpoint.v1" as const;
export const TASKMAP_CANONICAL_MEETING_VERSION = "taskmap-canonical-meeting.v1" as const;
export const TASKMAP_SOURCE_SNAPSHOT_VERSION = "taskmap-source-snapshot.v1" as const;
export const TASKMAP_SEMANTIC_PROPOSAL_REFERENCE_VERSION =
  "taskmap-semantic-proposal-reference.v1" as const;
export const TASKMAP_GATE_DECISION_VERSION = "taskmap-gate-decision.v1" as const;
export const TASKMAP_REPLAY_MANIFEST_VERSION = "taskmap-replay-manifest.v1" as const;
export const TASKMAP_PROJECTION_DIFF_VERSION = "taskmap-projection-diff.v1" as const;
export const TASKMAP_PROJECTION_TARGET_VERSION = "taskmap-projection-target.v1" as const;
export const TASKMAP_PROJECTION_PARITY_VERSION = "taskmap-projection-parity.v1" as const;

export type TaskMapExperimentArm = "E0" | "E1" | "E2" | "E3" | "E4";

export type TaskMapSourceKind =
  | "linear"
  | "jira"
  | "github"
  | "slack"
  | "google_chat"
  | "gmail"
  | "google_calendar"
  | "local_calendar"
  | "google_tasks"
  | "gemini_meet"
  | "granola"
  | "codex_session"
  | "claude_session"
  | "cursor_session"
  | "oura"
  | "strategy"
  | "manual"
  | "unknown";

export type TaskMapRecordKind =
  | "authoritative_task"
  | "work_context"
  | "body_context"
  | "receipt";

export type TaskMapAuthority = "source_system" | "user" | "none";

export type TaskMapSyncMode =
  | "native_agent"
  | "writeback"
  | "return_only"
  | "reference_only"
  | "personal_fork";

export type TaskMapCapability =
  | "read_task"
  | "read_context"
  | "create_task"
  | "update_status"
  | "comment_or_reply"
  | "create_source_draft"
  | "publish_or_send"
  | "delegate_native_agent"
  | "attach_or_link_artifact"
  | "deep_link"
  | "webhook_or_incremental_sync"
  | "optimistic_version_check";

export interface TaskMapSourceAuthorityBindingV1 {
  connectionId: string;
  sourceKind: TaskMapSourceKind;
  tenantOrWorkspaceDigest: string;
  accountOrPrincipalDigest: string;
  grantVersion: string;
}

export type TaskMapSourceObjectType =
  | "authoritative_task"
  | "meeting_note"
  | "calendar_event"
  | "agent_session"
  | "body_context"
  | "strategy_context";

export type TaskMapEvidenceAuthority =
  | "authoritative_task"
  | "explicit_commitment"
  | "provider_generated_summary"
  | "context_only"
  | "body_context_only";

export type TaskMapEvidenceQuality =
  | "source_native"
  | "structured_generated"
  | "provider_summary"
  | "degraded_summary"
  | "bounded_context"
  | "coverage_only";

export type TaskMapLifecycleAuthority = "source_status" | "explicit_user_policy" | "none";
export type TaskMapCompletionAuthority = "source_status" | "explicit_user_policy" | "none";
export type TaskMapRankEligibility =
  | "accepted_work"
  | "candidate_only"
  | "context_only"
  | "body_bonus_only";

export interface TaskMapAuthorityContractV1 {
  evidence: TaskMapEvidenceAuthority;
  quality: TaskMapEvidenceQuality;
  lifecycle: TaskMapLifecycleAuthority;
  completion: TaskMapCompletionAuthority;
  rank: TaskMapRankEligibility;
}

export interface TaskMapMeetingIdentityHintV1 {
  fingerprintVersion: "taskmap-meeting-fingerprint.1";
  startAt: string;
  endAt?: string;
  calendarEventIdDigest?: string;
  normalizedTitleDigest: string;
  participantSetDigest: string;
}

/**
 * Immutable adapter output. It deliberately has no title, summary, body,
 * transcript, participant, email-content, raw-biometric, or session-body
 * field. Semantic text remains in a separately reviewed artifact.
 */
export interface TaskMapSourceEnvelopeV1 {
  contractVersion: typeof TASKMAP_SOURCE_ENVELOPE_VERSION;
  envelopeId: string;
  ownerScopeDigest: string;
  sourceObjectKeyDigest: string;
  sourceIdentityDigest: string;
  binding: TaskMapSourceAuthorityBindingV1;
  sourceKind: TaskMapSourceKind;
  objectType: TaskMapSourceObjectType;
  sourceObjectId: string;
  sourceRevision: string;
  eventTime: string;
  contentDigest: string;
  authority: TaskMapAuthorityContractV1;
  meetingIdentity?: TaskMapMeetingIdentityHintV1;
  privacy: {
    sourceBodiesStored: false;
    emailBodiesStored: false;
    participantDetailsStored: false;
    rawBiometricsStored: false;
    fullAgentSessionBodiesStored: false;
    localPathsStored: false;
  };
}

export type TaskMapDiscoveryChannel = "gmail_direct" | "gmail_forwarded";

export interface TaskMapDiscoveryPointerV1 {
  contractVersion: typeof TASKMAP_DISCOVERY_POINTER_VERSION;
  discoveryId: string;
  ownerScopeDigest: string;
  binding: TaskMapSourceAuthorityBindingV1;
  channel: TaskMapDiscoveryChannel;
  opaqueMessageId: string;
  targetSourceKind: "gemini_meet";
  targetSourceObjectId: string;
  targetSourceIdentityDigest: string;
  resolvedTargetUrlDigest: string;
  duplicateContentSuppressed: true;
}

export interface TaskMapConnectorWatermarkV1 {
  kind: "revision" | "cursor" | "event_time" | "composite";
  valueDigest: string;
  observedThrough?: string;
}

export interface TaskMapConnectorCheckpointV1 {
  contractVersion: typeof TASKMAP_CONNECTOR_CHECKPOINT_VERSION;
  checkpointId: string;
  binding: TaskMapSourceAuthorityBindingV1;
  sourceKind: TaskMapSourceKind;
  adapterVersion: string;
  capabilities: TaskMapCapability[];
  state: "success" | "partial" | "failed";
  lastAttemptAt: string;
  lastSuccessfulPollAt?: string;
  watermark?: TaskMapConnectorWatermarkV1;
  watermarkHistoryDigests: string[];
  acceptedSourceIdentityDigests: string[];
  error?: {
    code: string;
    detailDigest: string;
  };
}

export interface TaskMapCanonicalMeetingV1 {
  contractVersion: typeof TASKMAP_CANONICAL_MEETING_VERSION;
  canonicalMeetingId: string;
  identityMethod: "calendar_event" | "bounded_fingerprint";
  identityKeyDigest: string;
  identityAliases: string[];
  fingerprintDigest: string;
  startAt: string;
  reviewState: "resolved" | "needs_review";
  conflictCodes: string[];
  calendarEnvelopeIds: string[];
  evidenceVariantEnvelopeIds: string[];
}

export interface TaskMapSourceSnapshotV1 {
  contractVersion: typeof TASKMAP_SOURCE_SNAPSHOT_VERSION;
  snapshotId: string;
  ownerScopeDigest: string;
  sourceSnapshotDigest: string;
  semanticInputDigest: string;
  bodyContextDigest: string;
  discoveryProvenanceDigest: string;
  envelopes: TaskMapSourceEnvelopeV1[];
  discoveryPointers: TaskMapDiscoveryPointerV1[];
  canonicalMeetings: TaskMapCanonicalMeetingV1[];
  privacy: TaskMapSourceEnvelopeV1["privacy"];
}

/**
 * Closed reference to a separately retained semantic artifact. It cannot carry
 * authority, lifecycle, completion, rank, route, acceptance, or final IDs.
 */
export interface TaskMapSemanticProposalReferenceV1 {
  contractVersion: typeof TASKMAP_SEMANTIC_PROPOSAL_REFERENCE_VERSION;
  semanticInputDigest: string;
  semanticBrainDigest: string;
  rootProposalIds: string[];
  candidateProposalIds: string[];
  relationProposalIds: string[];
}

export type TaskMapDeterministicGate =
  | "identity"
  | "privacy"
  | "dedupe"
  | "authority"
  | "lifecycle"
  | "completion"
  | "supersede"
  | "dependency"
  | "rank";

export interface TaskMapGateDecisionV1 {
  contractVersion: typeof TASKMAP_GATE_DECISION_VERSION;
  decisionId: string;
  subjectId: string;
  gate: TaskMapDeterministicGate;
  outcome: "accepted" | "rejected" | "candidate_only" | "context_only" | "body_bonus_only";
  reasonCodes: string[];
}

export interface TaskMapSourcePointer {
  id: string;
  sourceKind: TaskMapSourceKind;
  /** Opaque external identity. Never a local file path or credential. */
  sourceObjectId: string;
  /** Stable hash of a private source reference; safe for local projection use. */
  sourceRefHash: string;
  canonicalUrl?: string;
  sourceVersion?: string;
  authority: TaskMapAuthority;
  syncMode: TaskMapSyncMode;
  capabilities: TaskMapCapability[];
}

export type TaskMapActivity =
  | "task_created"
  | "task_updated"
  | "task_completed"
  | "task_reopened"
  | "commitment_stated"
  | "decision_deferred"
  | "decision_made"
  | "artifact_delivered"
  | "receipt_observed"
  | "context_observed"
  | "body_window_observed";

export type TaskMapSourceStatus =
  | "open"
  | "in_progress"
  | "blocked"
  | "awaiting_review"
  | "completed"
  | "cancelled"
  | "unknown";

export interface TaskMapEvent {
  id: string;
  pointerId: string;
  recordKind: TaskMapRecordKind;
  activity: TaskMapActivity;
  occurredAt: string;
  observedAt: string;
  /** Source-local calendar day; required for body and body-join-eligible events. */
  dayKey?: string;
  objectRefs: string[];
  /** Privacy-bounded text supplied to the semantic brain. */
  title: string;
  summary: string;
  extractionConfidence: number;
  sourceStatus?: TaskMapSourceStatus;
  priority?: number;
  deadlineAt?: string;
  supersedesEventId?: string;
  retractsEventId?: string;
  bodyCategory?: "below_baseline" | "within_baseline" | "above_baseline" | "unknown";
  bodyAxis?:
    | "hrv"
    | "resting_heart_rate"
    | "sleep"
    | "readiness"
    | "activity"
    | "composite_recovery"
    | "unknown";
  /** Explicit source availability receipt; never inferred from observed work. */
  corpusCoverage?: "complete";
  /** Explicit actual-work timestamp; source snapshots/tasks default to false. */
  bodyJoinEligible?: boolean;
}

export interface TaskMapInput {
  contractVersion: typeof TASKMAP_CONTRACT_VERSION;
  generatedAt: string;
  pointers: TaskMapSourcePointer[];
  events: TaskMapEvent[];
}

export type BrainTaskOpenState =
  | "open"
  | "possibly_open"
  | "blocked"
  | "awaiting_review"
  | "completed"
  | "superseded"
  | "unknown";

export interface BrainRootProposal {
  proposalId: string;
  title: string;
  summary: string;
  evidenceEventIds: string[];
  memberObjectRefs: string[];
  confidence: number;
}

export interface BrainTaskProposal {
  proposalId: string;
  rootProposalId: string;
  title: string;
  summary: string;
  evidenceEventIds: string[];
  /**
   * When present, this must point to an authoritative_task event. Its source
   * remains the status and completion authority.
   */
  authoritativeTaskEventId?: string;
  /** Optional cited origin selected for an approval-gated return route. */
  proposedReturnPointerId?: string;
  openState: BrainTaskOpenState;
  confidence: number;
}

export type BrainRelation =
  | "advances"
  | "depends_on"
  | "blocks"
  | "informed_by"
  | "related_to"
  | "supersedes";

export interface BrainEdgeProposal {
  proposalId: string;
  fromProposalId: string;
  toProposalId: string;
  relation: BrainRelation;
  evidenceEventIds: string[];
  confidence: number;
}

export interface SemanticBrainOutput {
  contractVersion: typeof TASKMAP_CONTRACT_VERSION;
  provider: string;
  model: string;
  promptHash: string;
  inputDigest: string;
  generatedAt: string;
  roots: BrainRootProposal[];
  tasks: BrainTaskProposal[];
  edges: BrainEdgeProposal[];
}

export interface RootCausalGateInput {
  rootProposalId: string;
  /** Privacy-safe body domain; target and neutral reference stay within this axis. */
  bodyAxis:
    | "hrv"
    | "resting_heart_rate"
    | "sleep"
    | "readiness"
    | "activity"
    | "composite_recovery"
    | "unknown";
  /** The relative body state whose days define the causal gate target set. */
  bodyCategory: "below_baseline" | "above_baseline";
  enrichment: EnrichmentGateInput;
}

export type CausalGrade =
  | "C0_NO_DATA"
  | "C1_CORRELATION"
  | "C2_ATTRIBUTION_CANDIDATE"
  | "C3_CAUSAL_HYPOTHESIS"
  | "C4_VALIDATED_PATTERN";

/** JSON-safe form of EnrichmentGateResult (Infinity is never serialized as null). */
export type TaskMapCausalGateResult = Omit<EnrichmentGateResult, "ratio"> & {
  ratio: number | null;
  enrichmentInfinite: boolean;
};

export type TaskMapReviewState =
  | "accepted"
  | "proposed"
  | "dismissed"
  | "source_complete"
  | "superseded";

export interface TaskMapCitation {
  eventId: string;
  pointerId: string;
  sourceKind: TaskMapSourceKind;
  sourceRefHash: string;
  occurredAt: string;
  extractionConfidence: number;
}

export interface TaskMapProjectionSource {
  id: string;
  sourceKind: TaskMapSourceKind;
  canonicalUrl?: string;
  sourceVersion?: string;
  authority: TaskMapAuthority;
  syncMode: TaskMapSyncMode;
  capabilities: TaskMapCapability[];
}

export interface TaskMapScoreBreakdown {
  sourcePriority: number;
  deadlinePressure: number;
  dependencyImpact: number;
  recurrence: number;
  staleOpen: number;
  evidenceStrength: number;
  bodyBonus: number;
  total: number;
}

export interface TaskMapRootScoreBreakdown {
  maxChildActionability: number;
  rootRecurrence: number;
  evidenceStrength: number;
  sourceBreadth: number;
  actionableLoad: number;
  dependencyBreadth: number;
  bodyBonus: number;
  total: number;
}

export interface TaskMapTask {
  id: string;
  rootId: string;
  title: string;
  summary: string;
  reviewState: TaskMapReviewState;
  openState: BrainTaskOpenState;
  authority: TaskMapAuthority;
  taskHomePointerId?: string;
  originPointerIds: string[];
  returnRoute:
    | { state: "source_owned"; pointerId: string; requiresApproval: true }
    | { state: "source_return"; pointerId: string; requiresApproval: true }
    | { state: "user_destination_required"; requiresApproval: true }
    | { state: "personal_fork"; pointerId: string; requiresApproval: true };
  sourceStatus?: TaskMapSourceStatus;
  citations: TaskMapCitation[];
  score: TaskMapScoreBreakdown;
  whyNow: string[];
  discoveredBy: string[];
  /** Joined only after work membership is fixed; never used to create a task. */
  bodyContextCount: number;
}

export interface TaskMapRoot {
  id: string;
  title: string;
  summary: string;
  taskIds: string[];
  /** Optional view hint over taskIds. Absent means show every member. */
  visibleTaskIds?: string[];
  memberObjectRefs: string[];
  citations: TaskMapCitation[];
  causalGrade: CausalGrade;
  causalGate?: TaskMapCausalGateResult;
  bodyContextCount: number;
  scoreBreakdown: TaskMapRootScoreBreakdown;
  score: number;
  whyNow: string[];
}

export interface TaskMapEdge {
  id: string;
  from: string;
  to: string;
  relation: BrainRelation | "body_context_for";
  citations: TaskMapCitation[];
}

export interface TaskMapRejection {
  proposalId: string;
  kind: "root" | "task" | "edge" | "input";
  reasons: string[];
}

export interface TaskMapProjectionV1 {
  contractVersion: typeof TASKMAP_CONTRACT_VERSION;
  algorithmPolicyVersion: typeof TASKMAP_ALGORITHM_POLICY_VERSION;
  algorithmPolicyDigest: string;
  runStatus: "accepted" | "rejected";
  arm: TaskMapExperimentArm;
  runId: string;
  generatedAt: string;
  inputDigest: string;
  brain: {
    provider: string;
    model: string;
    promptHash: string;
    outputDigest: string;
  } | null;
  /** Minimal local routing table. It contains no source object IDs or bodies. */
  sources: TaskMapProjectionSource[];
  roots: TaskMapRoot[];
  tasks: TaskMapTask[];
  edges: TaskMapEdge[];
  rejections: TaskMapRejection[];
  privacy: {
    sourceBodiesStored: false;
    localPathsStored: false;
    rawBiometricsStored: false;
  };
}

export interface TaskMapProjectionDiffEntryV1 {
  kind: "source" | "root" | "task" | "edge" | "rejection";
  id: string;
  beforeDigest?: string;
  afterDigest?: string;
  changedFields: string[];
}

export interface TaskMapProjectionDiffV1 {
  contractVersion: typeof TASKMAP_PROJECTION_DIFF_VERSION;
  diffId: string;
  previousProjectionDigest: string;
  currentProjectionDigest: string;
  added: TaskMapProjectionDiffEntryV1[];
  removed: TaskMapProjectionDiffEntryV1[];
  changed: TaskMapProjectionDiffEntryV1[];
}

export type TaskMapProjectionRecordRole =
  | "shared_accepted_work"
  | "strategy_durable_context"
  | "taskmap_candidate_review"
  | "taskmap_operational_detail";

export interface TaskMapProjectionTargetRecordV1 {
  canonicalRecordId: string;
  role: TaskMapProjectionRecordRole;
  sourceIdentityDigest: string;
  lifecycle: "candidate" | "accepted_open" | "resolved";
  recordDigest: string;
}

export interface TaskMapProjectionTargetV1 {
  contractVersion: typeof TASKMAP_PROJECTION_TARGET_VERSION;
  target: "strategy" | "task_map";
  acceptedDeltaDigest: string;
  records: TaskMapProjectionTargetRecordV1[];
  privacy: {
    sourceBodiesStored: false;
    strategyProseStored: false;
    localPathsStored: false;
  };
}

export interface TaskMapProjectionParityFindingV1 {
  canonicalRecordId: string;
  code:
    | "strategy_durable_context_only"
    | "taskmap_candidate_review_only"
    | "taskmap_operational_detail_only"
    | "shared_work_missing_strategy"
    | "shared_work_missing_task_map"
    | "source_identity_mismatch"
    | "role_mismatch"
    | "lifecycle_mismatch"
    | "accepted_delta_mismatch";
}

export interface TaskMapProjectionParityV1 {
  contractVersion: typeof TASKMAP_PROJECTION_PARITY_VERSION;
  comparisonId: string;
  acceptedDeltaDigest: string;
  intentionalDifferences: TaskMapProjectionParityFindingV1[];
  failures: TaskMapProjectionParityFindingV1[];
}

export interface TaskMapReplayPolicyBindingV1 {
  name:
    | "source"
    | "normalization"
    | "identity"
    | "privacy"
    | "dedupe"
    | "authority"
    | "lifecycle"
    | "completion"
    | "supersede"
    | "dependency"
    | "rank"
    | "algorithm";
  version: string;
  digest: string;
}

export interface TaskMapReplayManifestV1 {
  contractVersion: typeof TASKMAP_REPLAY_MANIFEST_VERSION;
  manifestId: string;
  replayKey: string;
  fixedNow: string;
  sourceSnapshotDigest: string;
  semanticInputDigest: string;
  semanticProposal: TaskMapSemanticProposalReferenceV1;
  previousProjectionDigest: string;
  policyBindings: TaskMapReplayPolicyBindingV1[];
  connectorCheckpointDigests: string[];
  gateDecisions: TaskMapGateDecisionV1[];
  projectionDiff: TaskMapProjectionDiffV1;
  projectionParityDigest?: string;
  privacy: {
    sourceBodiesStored: false;
    emailBodiesStored: false;
    participantDetailsStored: false;
    rawBiometricsStored: false;
    fullAgentSessionBodiesStored: false;
    localPathsStored: false;
  };
}

export const TASKMAP_BODY_CONTEXT_CONTRACT_VERSION = "taskmap-body-context.v1" as const;

export type TaskMapBodyCategory =
  | "below_baseline"
  | "within_baseline"
  | "above_baseline"
  | "unknown";

export type TaskMapBodyAxis =
  | "hrv"
  | "resting_heart_rate"
  | "sleep"
  | "readiness"
  | "activity"
  | "composite_recovery"
  | "unknown";

/**
 * Privacy-bounded disclosure that binds relative Oura context to one accepted
 * projection. It is deliberately separate from the operational Task Map:
 * body context can explain urgency after work membership is fixed, but cannot
 * become task/source authority.
 */
export interface TaskMapBodyContextDisclosureV1 {
  contractVersion: typeof TASKMAP_BODY_CONTEXT_CONTRACT_VERSION;
  projectionRunId: string;
  projectionInputDigest: string;
  generatedAt: string;
  sourceKind: "oura";
  coverage: {
    startDay: string;
    endDay: string;
    dailyActivityDays: number;
    dailyReadinessDays: number;
    dailySleepDays: number;
    sleepRecords: number;
    heartRateSamples: number;
    classifiedDays: number;
    unknownDays: number;
  };
  classifier: {
    version: string;
    axis: "composite_recovery";
    method: string;
    minimumMetricsPerDay: number;
    lowerThreshold: number;
    upperThreshold: number;
  };
  nodes: Array<{
    nodeId: string;
    matches: Array<{
      dayKey: string;
      axis: TaskMapBodyAxis;
      category: Exclude<TaskMapBodyCategory, "unknown" | "within_baseline">;
      backingSourceCount: number;
      sourceKind: "oura";
    }>;
  }>;
  privacy: {
    rawBiometricsStored: false;
    sourceBodiesStored: false;
    localPathsStored: false;
  };
}

export interface TaskMapHarnessOptions {
  arm: TaskMapExperimentArm;
  now?: string;
  previousProjection?: TaskMapProjectionV1;
  causalInputs?: RootCausalGateInput[];
}

export interface TaskMapAblationReport {
  algorithmPolicyVersion: typeof TASKMAP_ALGORITHM_POLICY_VERSION;
  algorithmPolicyDigest: string;
  generatedAt: string;
  inputDigest: string;
  semanticInputDigest: string;
  brain: {
    provider: string;
    model: string;
    promptHash: string;
    inputDigest: string;
    generatedAt: string;
    outputDigest: string;
  };
  arms: Array<{
    arm: TaskMapExperimentArm;
    runId: string;
    runStatus: TaskMapProjectionV1["runStatus"];
    rejectionCount: number;
    rejectionSummary: Array<{
      kind: TaskMapRejection["kind"];
      count: number;
    }>;
    roots: number;
    tasks: number;
    acceptedTasks: number;
    proposedTasks: number;
    bodyBonusTotal: number;
    membershipSignature: string;
  }>;
  controls: {
    bodyMaskRunId: string;
    bodyShuffleRunId: string;
    /** null means one of the compared projections was rejected. */
    bodyMaskMembershipStable: boolean | null;
    /** null means one of the compared projections was rejected. */
    bodyShuffleMembershipStable: boolean | null;
  };
}

/**
 * P9.3 reviewed truth labels are an evaluation contract, not another source
 * envelope or projection state. T0-T4 are chronological truth splits. They are
 * distinct from the research A0-A4 capability arms and the E0-E4 harness arms.
 */
export const TASKMAP_TRUTH_SET_DRAFT_VERSION = "taskmap-truth-set-draft.v1" as const;
export const TASKMAP_TRUTH_SET_VERSION = "taskmap-truth-set.v1" as const;
export const TASKMAP_TRUTH_LABEL_POLICY_VERSION = "taskmap-truth-label-policy.4" as const;
export const TASKMAP_TRUTH_TIME_SPLIT_POLICY_VERSION =
  "taskmap-truth-time-splits.1" as const;
export const TASKMAP_TRUTH_REVIEW_BATCH_POLICY_VERSION =
  "taskmap-truth-review-batch-policy.1" as const;
export const TASKMAP_OWNER_TRUTH_SET_VERSION = "taskmap-owner-truth-set.v2" as const;

export type TaskMapTruthTimeSplit = "T0" | "T1" | "T2" | "T3" | "T4";

export interface TaskMapTruthSplitBoundaryV1 {
  timeSplit: TaskMapTruthTimeSplit;
  startAt: string;
  endAt: string;
  semantics: "inclusive_start_exclusive_end";
}

export type TaskMapTruthWorkClass =
  | "explicit_work"
  | "inferred_candidate"
  | "context_only"
  | "non_work";

export type TaskMapTruthEvidenceRole =
  | "primary_authority"
  | "corroborating_variant"
  | "identity_anchor"
  | "discovery_pointer"
  | "delegated_execution";

export type TaskMapTruthAdjudication =
  | "accepted_work"
  | "candidate_review"
  | "context_only"
  | "merge_into_existing"
  | "exclude_duplicate"
  | "reject_pollution";

export type TaskMapTruthLifecycle =
  | "open"
  | "blocked"
  | "awaiting_review"
  | "completed"
  | "superseded"
  | "unknown";

export type TaskMapTruthExpectedDelta =
  | "none"
  | "new_root"
  | "new_accepted_work"
  | "update_existing_work"
  | "new_candidate"
  | "merge_existing_work";

export type TaskMapTruthLabelAuthority =
  | "source_authority"
  | "reviewed_truth"
  | "deterministic_policy";

export type TaskMapTruthSessionRole = "root" | "subagent" | "wrapper";

export type TaskMapTruthReasonCode =
  | "source_native_open_work"
  | "source_native_blocked_work"
  | "strategy_durable_context"
  | "provider_corroborates_existing"
  | "gmail_discovery_semantically_neutral"
  | "no_bounded_calendar_anchor"
  | "calendar_identity_anchor"
  | "structured_meeting_primary"
  | "provider_variant_deduped"
  | "meeting_recurrence_counted_once"
  | "existing_work_match"
  | "owner_missing_candidate_review"
  | "strategy_reviewed_existing_work_merge"
  | "strategy_blocker_candidate_review"
  | "asr_pollution"
  | "numeric_asr_pollution"
  | "session_continues_existing_root"
  | "delegated_subagent_not_independent_work"
  | "wrapper_not_work"
  | "source_completion_terminal"
  | "superseded_terminal"
  | "body_context_post_membership_only"
  | "unlinked_body_coverage"
  | "existing_work_updated"
  | "strategy_source_authority"
  | "no_automatic_task_acceptance";

export interface TaskMapTruthExpectedProjectionV1 {
  strategy:
    | "shared_accepted_work"
    | "strategy_durable_context"
    | "excluded";
  taskMap:
    | "shared_accepted_work"
    | "taskmap_candidate_review"
    | "taskmap_operational_detail"
    | "excluded";
}

export interface TaskMapTruthLabelDraftV1 {
  caseKey: string;
  subject: string;
  timeSplit: TaskMapTruthTimeSplit;
  sourceKind: TaskMapSourceKind;
  sourceRecordRef: string;
  canonicalEventRef?: string;
  canonicalWorkRef?: string;
  discoveryChannel?: TaskMapDiscoveryChannel;
  sessionRole?: TaskMapTruthSessionRole;
  workClass: TaskMapTruthWorkClass;
  evidenceRole: TaskMapTruthEvidenceRole;
  adjudication: TaskMapTruthAdjudication;
  lifecycle: TaskMapTruthLifecycle;
  expectedProjection: TaskMapTruthExpectedProjectionV1;
  expectedDelta: TaskMapTruthExpectedDelta;
  recurrenceContribution: 0 | 1;
  membershipContribution: 0 | 1;
  reasonCodes: TaskMapTruthReasonCode[];
  labelAuthority: TaskMapTruthLabelAuthority;
}

export interface TaskMapTruthLabelV1 extends TaskMapTruthLabelDraftV1 {
  labelId: string;
}

export interface TaskMapTruthMetricsV1 {
  labelCount: number;
  canonicalMeetingCount: number;
  newRootCount: number;
  newAcceptedWorkCount: number;
  updatedExistingWorkCount: number;
  candidateReviewCount: number;
  automaticAcceptedFromMeetingOrSessionCount: number;
  recurrenceContribution: number;
  membershipContribution: number;
  mergeIntoExistingCount: number;
  duplicateExclusionCount: number;
  pollutionRejectionCount: number;
  falseReopenCount: number;
}

export interface TaskMapTruthSplitMetricsV1 {
  timeSplit: TaskMapTruthTimeSplit;
  metrics: TaskMapTruthMetricsV1;
}

export interface TaskMapTruthSetDraftV1 {
  contractVersion: typeof TASKMAP_TRUTH_SET_DRAFT_VERSION;
  splitPolicyVersion: typeof TASKMAP_TRUTH_TIME_SPLIT_POLICY_VERSION;
  splitBoundaries: TaskMapTruthSplitBoundaryV1[];
  asOf: string;
  reviewedAt: string;
  labels: TaskMapTruthLabelDraftV1[];
  expectedSplitMetrics: TaskMapTruthSplitMetricsV1[];
  expectedOverallMetrics: TaskMapTruthMetricsV1;
}

export interface TaskMapTruthSetV1 {
  contractVersion: typeof TASKMAP_TRUTH_SET_VERSION;
  truthSetId: string;
  truthSetDigest: string;
  labelPolicyVersion: typeof TASKMAP_TRUTH_LABEL_POLICY_VERSION;
  splitPolicyVersion: typeof TASKMAP_TRUTH_TIME_SPLIT_POLICY_VERSION;
  reviewBatchPolicyVersion: typeof TASKMAP_TRUTH_REVIEW_BATCH_POLICY_VERSION;
  /**
   * Deterministic batch identity only. This is not an authority signature or
   * source attestation; the owner artifact binds it to the source manifest.
   */
  reviewBatchDigest: string;
  sourceContractVersion: typeof TASKMAP_SOURCE_ENVELOPE_VERSION;
  splitBoundaries: TaskMapTruthSplitBoundaryV1[];
  asOf: string;
  reviewedAt: string;
  labels: TaskMapTruthLabelV1[];
  splitMetrics: TaskMapTruthSplitMetricsV1[];
  overallMetrics: TaskMapTruthMetricsV1;
  privacy: {
    sourceBodiesStored: false;
    emailBodiesStored: false;
    participantDetailsStored: false;
    rawBiometricsStored: false;
    fullAgentSessionBodiesStored: false;
    localPathsStored: false;
    secretsStored: false;
  };
}
