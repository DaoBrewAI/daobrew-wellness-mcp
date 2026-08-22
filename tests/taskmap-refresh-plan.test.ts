import assert from "node:assert";
import { describe, it } from "node:test";
import {
  advanceTaskMapConnectorCheckpoint,
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "../src/engine/taskmap/source-contracts.js";
import {
  TASKMAP_REFRESH_BATCH_VERSION,
  TASKMAP_REFRESH_LANE_VERSION,
  TASKMAP_REFRESH_PLAN_LIMITS_V1,
  TASKMAP_REFRESH_PLAN_DRAFT_VERSION,
  TASKMAP_REFRESH_PLAN_VERSION,
  TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION,
  assertTaskMapReadyBatch,
  assertTaskMapRefreshPlan,
  buildTaskMapRefreshPlan,
  selectTaskMapReadyBatch,
  type TaskMapRefreshLaneStateV1,
  type TaskMapRefreshPlanDraftV1,
} from "../src/engine/taskmap/refresh-plan.js";

const SHA256 = /^[a-f0-9]{64}$/;

type JsonRecord = Record<string, unknown>;
type RefreshPlan = ReturnType<typeof buildTaskMapRefreshPlan>;
type RefreshBatch = ReturnType<typeof selectTaskMapReadyBatch>;
type RefreshLane = RefreshPlan["lanes"][number];
type RefreshLaneDraft = TaskMapRefreshPlanDraftV1["lanes"][number];

const digest = (label: string): string => taskMapContractDigest(`refresh-test:${label}`);

const LANE_IDS = {
  collectCalendar: "collect-google-calendar",
  collectGranola: "collect-granola",
  normalizeCalendar: "normalize-google-calendar",
  normalizeGranola: "normalize-granola",
  identityBarrier: "identity-dedupe-barrier",
  authorityGate: "deterministic-authority-gate",
  lifecycleGate: "deterministic-lifecycle-gate",
  projection: "taskmap-projection",
  publication: "publication",
} as const;

const SOURCE_ARTIFACTS = {
  calendar: {
    bindingDigest: digest("binding-google-calendar"),
    sourceIdentityDigest: digest("identity-google-calendar"),
    currentRevisionDigest: digest("revision-google-calendar-current"),
    currentContentDigest: digest("content-google-calendar-current"),
    priorRevisionDigest: digest("revision-google-calendar-prior"),
    priorContentDigest: digest("content-google-calendar-prior"),
    priorCheckpointDigest: digest("calendar-last-good-checkpoint"),
    priorSourceSliceDigest: digest("calendar-last-good-source-slice"),
  },
  granola: {
    bindingDigest: digest("binding-granola"),
    sourceIdentityDigest: digest("identity-granola"),
    currentRevisionDigest: digest("revision-granola-current"),
    currentContentDigest: digest("content-granola-current"),
    priorRevisionDigest: digest("revision-granola-prior"),
    priorContentDigest: digest("content-granola-prior"),
    priorCheckpointDigest: digest("granola-last-good-checkpoint"),
    priorSourceSliceDigest: digest("granola-last-good-source-slice"),
  },
} as const;

const REVIEWED_DIGESTS = {
  truthSetDigest: digest("truth-set"),
  reviewBatchDigest: digest("review-batch"),
  reviewAttestationVersion: TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION,
  reviewAttestationDigest: digest("review-attestation"),
  sourceManifestDigest: digest("source-manifest"),
} as const;

function canonicalPolicyBindings(): TaskMapRefreshPlanDraftV1["policyBindings"] {
  return [
    {
      name: "identity-policy",
      version: "identity-policy.1",
      digest: digest("policy-identity"),
    },
    {
      name: "normalization-policy",
      version: "normalization-policy.1",
      digest: digest("policy-normalization"),
    },
    {
      name: "publication-policy",
      version: "publication-policy.1",
      digest: digest("policy-publication"),
    },
    {
      name: "scheduling-policy",
      version: "scheduling-policy.1",
      digest: digest("policy-scheduling"),
    },
    {
      name: "source-policy",
      version: "source-policy.1",
      digest: digest("policy-source"),
    },
  ];
}

function lane(
  value: Omit<RefreshLaneDraft, "contractVersion">,
): RefreshLaneDraft {
  return {
    contractVersion: TASKMAP_REFRESH_LANE_VERSION,
    ...value,
  };
}

function canonicalLanes(): RefreshLaneDraft[] {
  return [
    lane({
      laneId: LANE_IDS.collectCalendar,
      goal: "provider_collect",
      operationVersion: "google-calendar-collect.1",
      priority: "P0",
      priorityReasonCodes: ["source_freshness"],
      predecessorLaneIds: [],
      resourceClaims: [{
        resourceId: "provider:google_calendar",
        mode: "shared",
      }],
      effect: "read_only",
      requiredForPublication: true,
      inputDigests: [
        SOURCE_ARTIFACTS.calendar.bindingDigest,
        SOURCE_ARTIFACTS.calendar.priorCheckpointDigest,
        SOURCE_ARTIFACTS.calendar.priorSourceSliceDigest,
      ],
      outputKinds: ["connector_checkpoint", "source_slice"],
    }),
    lane({
      laneId: LANE_IDS.collectGranola,
      goal: "provider_collect",
      operationVersion: "granola-collect.1",
      priority: "P0",
      priorityReasonCodes: ["source_freshness"],
      predecessorLaneIds: [],
      resourceClaims: [{
        resourceId: "provider:granola",
        mode: "shared",
      }],
      effect: "read_only",
      requiredForPublication: true,
      inputDigests: [
        SOURCE_ARTIFACTS.granola.bindingDigest,
        SOURCE_ARTIFACTS.granola.priorCheckpointDigest,
        SOURCE_ARTIFACTS.granola.priorSourceSliceDigest,
      ],
      outputKinds: ["connector_checkpoint", "source_slice"],
    }),
    lane({
      laneId: LANE_IDS.normalizeCalendar,
      goal: "source_normalize",
      operationVersion: "google-calendar-normalize.1",
      priority: "P0",
      priorityReasonCodes: ["identity_integrity"],
      predecessorLaneIds: [LANE_IDS.collectCalendar],
      resourceClaims: [{
        resourceId: "taskmap:normalization",
        mode: "shared",
      }],
      effect: "local_state",
      requiredForPublication: true,
      inputDigests: [
        SOURCE_ARTIFACTS.calendar.bindingDigest,
        SOURCE_ARTIFACTS.calendar.priorCheckpointDigest,
        SOURCE_ARTIFACTS.calendar.priorSourceSliceDigest,
      ],
      outputKinds: ["normalized_source"],
    }),
    lane({
      laneId: LANE_IDS.normalizeGranola,
      goal: "source_normalize",
      operationVersion: "granola-normalize.1",
      priority: "P0",
      priorityReasonCodes: ["identity_integrity"],
      predecessorLaneIds: [LANE_IDS.collectGranola],
      resourceClaims: [{
        resourceId: "taskmap:normalization",
        mode: "shared",
      }],
      effect: "local_state",
      requiredForPublication: true,
      inputDigests: [
        SOURCE_ARTIFACTS.granola.bindingDigest,
        SOURCE_ARTIFACTS.granola.priorCheckpointDigest,
        SOURCE_ARTIFACTS.granola.priorSourceSliceDigest,
      ],
      outputKinds: ["normalized_source"],
    }),
    lane({
      laneId: LANE_IDS.identityBarrier,
      goal: "identity_dedupe_barrier",
      operationVersion: "taskmap-identity-dedupe.1",
      priority: "P0",
      priorityReasonCodes: ["identity_integrity"],
      predecessorLaneIds: [
        LANE_IDS.normalizeCalendar,
        LANE_IDS.normalizeGranola,
      ],
      resourceClaims: [{
        resourceId: "taskmap:identity",
        mode: "exclusive",
      }],
      effect: "local_state",
      requiredForPublication: true,
      inputDigests: [
        digest("semantic-google-calendar-current"),
        digest("semantic-granola-current"),
      ],
      outputKinds: ["identity_set"],
    }),
    lane({
      laneId: LANE_IDS.authorityGate,
      goal: "deterministic_gate",
      operationVersion: "taskmap-authority-gate.1",
      priority: "P0",
      priorityReasonCodes: ["deterministic_replay"],
      predecessorLaneIds: [LANE_IDS.identityBarrier],
      resourceClaims: [{
        resourceId: "taskmap:deterministic-gates",
        mode: "shared",
      }],
      effect: "local_state",
      requiredForPublication: true,
      inputDigests: [
        digest("review-attestation"),
        digest("policy-authority"),
      ],
      outputKinds: ["gate_decision"],
    }),
    lane({
      laneId: LANE_IDS.lifecycleGate,
      goal: "deterministic_gate",
      operationVersion: "taskmap-lifecycle-gate.1",
      priority: "P0",
      priorityReasonCodes: ["deterministic_replay"],
      predecessorLaneIds: [LANE_IDS.identityBarrier],
      resourceClaims: [{
        resourceId: "taskmap:deterministic-gates",
        mode: "shared",
      }],
      effect: "local_state",
      requiredForPublication: true,
      inputDigests: [
        digest("truth-set"),
        digest("policy-lifecycle"),
      ],
      outputKinds: ["gate_decision"],
    }),
    lane({
      laneId: LANE_IDS.projection,
      goal: "taskmap_projection",
      operationVersion: "taskmap-projection.1",
      priority: "P0",
      priorityReasonCodes: ["publication_safety"],
      predecessorLaneIds: [
        LANE_IDS.authorityGate,
        LANE_IDS.lifecycleGate,
      ],
      resourceClaims: [{
        resourceId: "taskmap:projection",
        mode: "exclusive",
      }],
      effect: "local_state",
      requiredForPublication: true,
      inputDigests: [
        digest("truth-set"),
        digest("review-batch"),
        digest("replay-current"),
      ],
      outputKinds: ["taskmap_projection"],
    }),
    lane({
      laneId: LANE_IDS.publication,
      goal: "publication",
      operationVersion: "taskmap-publication.1",
      priority: "P0",
      priorityReasonCodes: ["publication_safety"],
      predecessorLaneIds: [LANE_IDS.projection],
      resourceClaims: [{
        resourceId: "taskmap:accepted-head",
        mode: "exclusive",
      }],
      effect: "local_state",
      requiredForPublication: true,
      inputDigests: [
        digest("source-manifest"),
        digest("replay-current"),
      ],
      outputKinds: ["accepted_state"],
    }),
  ];
}

function revisionSetsFor(
  revisions: TaskMapRefreshPlanDraftV1["sourceRevisions"],
  bindingDigests: readonly string[],
): TaskMapRefreshPlanDraftV1["sourceRevisionSets"] {
  return [...bindingDigests]
    .sort()
    .map((bindingDigest) => ({
      bindingDigest,
      revisionSetDigest: taskMapContractDigest(
        revisions
          .filter((revision) => revision.bindingDigest === bindingDigest)
          .map((revision) => ({
            sourceIdentityDigest: revision.sourceIdentityDigest,
            sourceRevisionDigest: revision.sourceRevisionDigest,
            contentDigest: revision.contentDigest,
          }))
          .sort((left, right) => (
            left.sourceIdentityDigest.localeCompare(right.sourceIdentityDigest)
            || left.sourceRevisionDigest.localeCompare(
              right.sourceRevisionDigest,
            )
            || left.contentDigest.localeCompare(right.contentDigest)
          )),
      ),
    }));
}

function canonicalDraft(): TaskMapRefreshPlanDraftV1 {
  const bindingDigests = [
    SOURCE_ARTIFACTS.calendar.bindingDigest,
    SOURCE_ARTIFACTS.granola.bindingDigest,
  ];
  const acceptedSourceRevisions:
    TaskMapRefreshPlanDraftV1["sourceRevisions"] = [
      {
        bindingDigest: SOURCE_ARTIFACTS.calendar.bindingDigest,
        sourceIdentityDigest:
          SOURCE_ARTIFACTS.calendar.sourceIdentityDigest,
        sourceRevisionDigest:
          SOURCE_ARTIFACTS.calendar.priorRevisionDigest,
        contentDigest: SOURCE_ARTIFACTS.calendar.priorContentDigest,
      },
      {
        bindingDigest: SOURCE_ARTIFACTS.granola.bindingDigest,
        sourceIdentityDigest:
          SOURCE_ARTIFACTS.granola.sourceIdentityDigest,
        sourceRevisionDigest:
          SOURCE_ARTIFACTS.granola.priorRevisionDigest,
        contentDigest: SOURCE_ARTIFACTS.granola.priorContentDigest,
      },
    ];
  const sourceRevisions: TaskMapRefreshPlanDraftV1["sourceRevisions"] = [
    {
      bindingDigest: SOURCE_ARTIFACTS.calendar.bindingDigest,
      sourceIdentityDigest:
        SOURCE_ARTIFACTS.calendar.sourceIdentityDigest,
      sourceRevisionDigest:
        SOURCE_ARTIFACTS.calendar.currentRevisionDigest,
      contentDigest: SOURCE_ARTIFACTS.calendar.currentContentDigest,
    },
    {
      bindingDigest: SOURCE_ARTIFACTS.granola.bindingDigest,
      sourceIdentityDigest:
        SOURCE_ARTIFACTS.granola.sourceIdentityDigest,
      sourceRevisionDigest:
        SOURCE_ARTIFACTS.granola.currentRevisionDigest,
      contentDigest: SOURCE_ARTIFACTS.granola.currentContentDigest,
    },
  ];
  return {
    contractVersion: TASKMAP_REFRESH_PLAN_DRAFT_VERSION,
    ownerScopeDigest: digest("owner-scope"),
    baseline: {
      kind: "accepted",
      priorCheckpointDigests: [
        SOURCE_ARTIFACTS.calendar.priorCheckpointDigest,
        SOURCE_ARTIFACTS.granola.priorCheckpointDigest,
      ],
      priorSourceSliceDigests: [
        SOURCE_ARTIFACTS.calendar.priorSourceSliceDigest,
        SOURCE_ARTIFACTS.granola.priorSourceSliceDigest,
      ],
      priorProviderArtifacts: [
        {
          bindingDigest: SOURCE_ARTIFACTS.calendar.bindingDigest,
          checkpointDigest: SOURCE_ARTIFACTS.calendar.priorCheckpointDigest,
          sourceSliceDigest:
            SOURCE_ARTIFACTS.calendar.priorSourceSliceDigest,
        },
        {
          bindingDigest: SOURCE_ARTIFACTS.granola.bindingDigest,
          checkpointDigest: SOURCE_ARTIFACTS.granola.priorCheckpointDigest,
          sourceSliceDigest:
            SOURCE_ARTIFACTS.granola.priorSourceSliceDigest,
        },
      ],
      priorAcceptedStateDigest: digest("accepted-state-prior"),
      priorOwnerScopeDigest: digest("owner-scope"),
      priorSourceSnapshotDigest: digest("source-snapshot-prior"),
      priorReviewedEvidenceDigest: digest("reviewed-evidence-prior"),
      priorPolicyBundleDigest: taskMapContractDigest(
        canonicalPolicyBindings(),
      ),
      priorSemanticImplementationDigest:
        digest("semantic-implementation-prior"),
      acceptedSourceRevisions,
      acceptedSourceRevisionSets: revisionSetsFor(
        acceptedSourceRevisions,
        bindingDigests,
      ),
      acceptedSemanticInputDigests: [
        digest("semantic-google-calendar-prior"),
        digest("semantic-granola-prior"),
      ],
      acceptedDeterministicReplayDigest: digest("replay-prior"),
    },
    reviewedDigests: { ...REVIEWED_DIGESTS },
    sourceBindings: [
      {
        bindingDigest: SOURCE_ARTIFACTS.calendar.bindingDigest,
        sourceKind: "google_calendar",
        sourceContractVersion: "taskmap-source-envelope.v1",
        adapterVersion: "google-calendar-adapter.1",
      },
      {
        bindingDigest: SOURCE_ARTIFACTS.granola.bindingDigest,
        sourceKind: "granola",
        sourceContractVersion: "taskmap-source-envelope.v1",
        adapterVersion: "granola-adapter.1",
      },
    ],
    sourceRevisions,
    sourceRevisionSets: revisionSetsFor(sourceRevisions, bindingDigests),
    semanticInputDigests: [
      digest("semantic-google-calendar-current"),
      digest("semantic-granola-current"),
    ],
    deterministicReplayDigest: digest("replay-current"),
    policyBindings: canonicalPolicyBindings(),
    lanes: canonicalLanes(),
  };
}

function exactNoOpDraft(): TaskMapRefreshPlanDraftV1 {
  const draft = canonicalDraft();
  draft.baseline.acceptedSourceRevisions =
    structuredClone(draft.sourceRevisions);
  draft.baseline.acceptedSourceRevisionSets =
    structuredClone(draft.sourceRevisionSets);
  draft.baseline.acceptedSemanticInputDigests = [
    ...draft.semanticInputDigests,
  ];
  draft.baseline.acceptedDeterministicReplayDigest =
    draft.deterministicReplayDigest;
  draft.baseline.priorReviewedEvidenceDigest =
    taskMapContractDigest(draft.reviewedDigests);
  draft.baseline.priorPolicyBundleDigest =
    taskMapContractDigest(draft.policyBindings);
  draft.baseline.priorSemanticImplementationDigest =
    buildTaskMapRefreshPlan(draft).semanticImplementationDigest;
  return draft;
}

function laneById(
  draft: TaskMapRefreshPlanDraftV1,
  laneId: string,
): RefreshLaneDraft {
  const found = draft.lanes.find((candidate) => candidate.laneId === laneId);
  assert.ok(found, `missing test lane ${laneId}`);
  return found;
}

function planLaneById(plan: RefreshPlan, laneId: string): RefreshLane {
  const found = plan.lanes.find((candidate) => candidate.laneId === laneId);
  assert.ok(found, `missing plan lane ${laneId}`);
  return found;
}

function laneStates(
  plan: RefreshPlan,
  overrides: Record<string, Partial<TaskMapRefreshLaneStateV1>> = {},
): TaskMapRefreshLaneStateV1[] {
  return plan.lanes.map((plannedLane) => ({
    laneId: plannedLane.laneId,
    status: "pending",
    ...overrides[plannedLane.laneId],
  }));
}

function optionalAuditLane(
  laneId: string,
  options: {
    operationVersion?: string;
    priority?: "P1" | "P2";
    priorityReasonCodes?: RefreshLaneDraft["priorityReasonCodes"];
    predecessorLaneIds?: string[];
    resourceClaims?: RefreshLaneDraft["resourceClaims"];
    inputDigests?: string[];
  } = {},
): RefreshLaneDraft {
  const priority = options.priority ?? "P2";
  return lane({
    laneId,
    goal: "refresh_audit",
    operationVersion:
      options.operationVersion ?? `audit.${digest(laneId).slice(0, 16)}`,
    priority,
    priorityReasonCodes: options.priorityReasonCodes
      ?? [priority === "P1" ? "optional_enrichment" : "optional_audit"],
    predecessorLaneIds: options.predecessorLaneIds ?? [],
    resourceClaims: options.resourceClaims ?? [{
      resourceId: `audit:${digest(`claim-${laneId}`)}`,
      mode: "shared",
    }],
    effect: "read_only",
    requiredForPublication: false,
    inputDigests: options.inputDigests ?? [digest(`input-${laneId}`)],
    outputKinds: ["refresh_audit"],
  });
}

function largeSelectablePlanDraft(
  evidenceItemCount: number,
): TaskMapRefreshPlanDraftV1 {
  const draft = canonicalDraft();
  draft.baseline.acceptedSourceRevisions = Array.from(
    { length: evidenceItemCount },
    (_, index) => ({
      bindingDigest: index % 2 === 0
        ? SOURCE_ARTIFACTS.calendar.bindingDigest
        : SOURCE_ARTIFACTS.granola.bindingDigest,
      sourceIdentityDigest: digest(`boundary-accepted-identity-${index}`),
      sourceRevisionDigest: digest(`boundary-accepted-revision-${index}`),
      contentDigest: digest(`boundary-accepted-content-${index}`),
    }),
  );
  draft.baseline.acceptedSourceRevisionSets = revisionSetsFor(
    draft.baseline.acceptedSourceRevisions,
    draft.baseline.priorProviderArtifacts.map(
      (artifact) => artifact.bindingDigest,
    ),
  );
  draft.semanticInputDigests = Array.from(
    { length: evidenceItemCount },
    (_, index) => digest(`boundary-current-semantic-${index}`),
  );
  draft.baseline.acceptedSemanticInputDigests = Array.from(
    { length: evidenceItemCount },
    (_, index) => digest(`boundary-accepted-semantic-${index}`),
  );

  const rootLaneIds: string[] = [];
  const coreLaneCount = draft.lanes.length;
  while (draft.lanes.length < TASKMAP_REFRESH_PLAN_LIMITS_V1.maxLanes) {
    const index = draft.lanes.length - coreLaneCount;
    const laneId = longSafeIdentifier("boundarylane", index);
    if (rootLaneIds.length < 4) rootLaneIds.push(laneId);
    draft.lanes.push(optionalAuditLane(laneId, {
      operationVersion: longSafeIdentifier("boundaryoperation", index),
      predecessorLaneIds: index < 4 ? [] : [...rootLaneIds],
      resourceClaims: Array.from({ length: 4 }, (_, claimIndex) => ({
        resourceId: longSafeIdentifier(
          "boundaryresource",
          index * 4 + claimIndex,
        ),
        mode: "shared" as const,
      })),
      inputDigests: Array.from(
        { length: 4 },
        (_, inputIndex) => digest(
          `boundary-lane-input-${index}-${inputIndex}`,
        ),
      ),
    }));
  }
  return draft;
}

function longSafeIdentifier(prefix: string, index: number): string {
  const head = `${prefix}${String(index).padStart(6, "0")}`;
  assert.ok(head.length <= 160);
  return `${head}${"x".repeat(160 - head.length)}`;
}

function rawLaneArrayItemCount(
  draft: TaskMapRefreshPlanDraftV1,
  key: "inputDigests" | "predecessorLaneIds" | "resourceClaims",
): number {
  return draft.lanes.reduce(
    (total, plannedLane) => total + plannedLane[key].length,
    0,
  );
}

function draftAtAggregateInputLimit(): TaskMapRefreshPlanDraftV1 {
  const draft = canonicalDraft();
  let remaining = (
    TASKMAP_REFRESH_PLAN_LIMITS_V1.maxTotalInputDigests
    - rawLaneArrayItemCount(draft, "inputDigests")
  );
  let laneIndex = 0;
  while (remaining > 0) {
    const inputCount = Math.min(
      TASKMAP_REFRESH_PLAN_LIMITS_V1.maxInputDigestsPerLane,
      remaining,
    );
    draft.lanes.push(optionalAuditLane(`input-bound-${laneIndex}`, {
      inputDigests: Array.from(
        { length: inputCount },
        (_, inputIndex) => digest(
          `input-bound-${laneIndex}-${inputIndex}`,
        ),
      ),
    }));
    remaining -= inputCount;
    laneIndex += 1;
  }
  return draft;
}

function draftAtAggregatePredecessorLimit():
TaskMapRefreshPlanDraftV1 {
  const draft = canonicalDraft();
  const producerLaneIds = Array.from(
    { length: TASKMAP_REFRESH_PLAN_LIMITS_V1.maxPredecessorsPerLane },
    (_, index) => `edge-producer-${index}`,
  );
  for (const laneId of producerLaneIds) {
    draft.lanes.push(optionalAuditLane(laneId));
  }
  let remaining = (
    TASKMAP_REFRESH_PLAN_LIMITS_V1.maxTotalPredecessorEdges
    - rawLaneArrayItemCount(draft, "predecessorLaneIds")
  );
  let consumerIndex = 0;
  while (remaining > 0) {
    const predecessorCount = Math.min(
      TASKMAP_REFRESH_PLAN_LIMITS_V1.maxPredecessorsPerLane,
      remaining,
    );
    draft.lanes.push(optionalAuditLane(
      `edge-consumer-${consumerIndex}`,
      {
        predecessorLaneIds: producerLaneIds.slice(0, predecessorCount),
      },
    ));
    remaining -= predecessorCount;
    consumerIndex += 1;
  }
  return draft;
}

function publicationRecord(batch: RefreshBatch): JsonRecord {
  const record = batch as unknown as JsonRecord;
  if (record.publication && typeof record.publication === "object") {
    return record.publication as JsonRecord;
  }
  return {
    state: record.publicationState,
    candidateAcceptedStateDigest: record.candidateAcceptedStateDigest,
    acceptedStateDigest: record.acceptedStateDigest,
    preservedAcceptedStateDigest: record.preservedAcceptedStateDigest,
    preservesPriorAcceptedState: record.preservesPriorAcceptedState,
  };
}

function publicationState(batch: RefreshBatch): string {
  const state = publicationRecord(batch).state;
  assert.strictEqual(typeof state, "string", "batch must expose publication state");
  return String(state);
}

function candidateAcceptedStateDigest(
  plan: RefreshPlan,
  batch?: RefreshBatch,
): string {
  const planRecord = plan as unknown as JsonRecord;
  const publication = batch ? publicationRecord(batch) : {};
  const value =
    publication.candidateAcceptedStateDigest
    ?? planRecord.candidateAcceptedStateDigest
    ?? planRecord.candidateStateDigest;
  assert.match(
    String(value),
    SHA256,
    "plan/batch must expose a full candidate accepted-state digest",
  );
  return String(value);
}

function preservedAcceptedStateDigest(batch: RefreshBatch): string {
  const publication = publicationRecord(batch);
  const value =
    publication.preservedAcceptedStateDigest
    ?? publication.acceptedStateDigest
    ?? publication.currentAcceptedStateDigest
    ?? publication.priorAcceptedStateDigest;
  assert.match(
    String(value),
    SHA256,
    "blocked/no-op publication must expose the preserved accepted-state digest",
  );
  return String(value);
}

function isExactNoOp(plan: RefreshPlan): boolean {
  const record = plan as unknown as JsonRecord;
  return Boolean(record.isExactNoOp ?? record.exactNoOp);
}

function expectDraftRejection(
  mutate: (draft: JsonRecord) => void,
  expected: RegExp,
): void {
  const draft = canonicalDraft() as unknown as JsonRecord;
  mutate(draft);
  assert.throws(
    () => buildTaskMapRefreshPlan(
      draft as unknown as TaskMapRefreshPlanDraftV1,
    ),
    expected,
  );
}

function stateOverridesThroughBarrier(): Record<
  string,
  Partial<TaskMapRefreshLaneStateV1>
> {
  return {
    [LANE_IDS.collectCalendar]: { status: "succeeded" },
    [LANE_IDS.collectGranola]: { status: "succeeded" },
    [LANE_IDS.normalizeCalendar]: { status: "succeeded" },
    [LANE_IDS.normalizeGranola]: { status: "succeeded" },
    [LANE_IDS.identityBarrier]: { status: "succeeded" },
  };
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffleInPlace<T>(values: T[], random: () => number): void {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
}

function permutedDraft(seed: number): TaskMapRefreshPlanDraftV1 {
  const draft = structuredClone(canonicalDraft());
  const random = seededRandom(seed);
  shuffleInPlace(draft.baseline.priorCheckpointDigests, random);
  shuffleInPlace(draft.baseline.priorSourceSliceDigests, random);
  shuffleInPlace(draft.baseline.priorProviderArtifacts, random);
  shuffleInPlace(draft.baseline.acceptedSourceRevisions, random);
  shuffleInPlace(draft.baseline.acceptedSourceRevisionSets, random);
  shuffleInPlace(draft.baseline.acceptedSemanticInputDigests, random);
  shuffleInPlace(draft.sourceBindings, random);
  shuffleInPlace(draft.sourceRevisions, random);
  shuffleInPlace(draft.sourceRevisionSets, random);
  shuffleInPlace(draft.semanticInputDigests, random);
  shuffleInPlace(draft.policyBindings, random);
  shuffleInPlace(draft.lanes, random);
  for (const item of draft.lanes) {
    shuffleInPlace(item.priorityReasonCodes, random);
    shuffleInPlace(item.predecessorLaneIds, random);
    shuffleInPlace(item.resourceClaims, random);
    shuffleInPlace(item.inputDigests, random);
    shuffleInPlace(item.outputKinds, random);
  }
  return draft;
}

function schedulingOracle(
  plan: RefreshPlan,
  states: readonly TaskMapRefreshLaneStateV1[],
  maxConcurrency: number,
): string[] {
  const stateByLaneId = new Map(
    states.map((state) => [state.laneId, state]),
  );
  const laneByLaneId = new Map(
    plan.lanes.map((plannedLane) => [plannedLane.laneId, plannedLane]),
  );
  const runningLaneIds = new Set(
    states
      .filter((state) => state.status === "running")
      .map((state) => state.laneId),
  );
  const reservations = plan.lanes
    .filter((plannedLane) => runningLaneIds.has(plannedLane.laneId))
    .flatMap((plannedLane) => plannedLane.resourceClaims);
  const capacity = Math.max(0, maxConcurrency - runningLaneIds.size);
  const priorityValue = (priority: RefreshLane["priority"]): number => (
    priority === "P0" ? 0 : priority === "P1" ? 1 : 2
  );
  const ready = plan.lanes
    .filter((plannedLane) => (
      stateByLaneId.get(plannedLane.laneId)?.status === "pending"
    ))
    .filter((plannedLane) => plannedLane.predecessorLaneIds.every(
      (predecessorLaneId) => (
        stateByLaneId.get(predecessorLaneId)?.status === "succeeded"
      ),
    ))
    .sort((left, right) => (
      priorityValue(left.priority) - priorityValue(right.priority)
      || left.laneId.localeCompare(right.laneId)
    ));
  const selected: string[] = [];
  for (const plannedLane of ready) {
    if (selected.length >= capacity) break;
    const conflicts = plannedLane.resourceClaims.some((claim) => (
      reservations.some((reservation) => (
        claim.resourceId === reservation.resourceId
        && (claim.mode === "exclusive" || reservation.mode === "exclusive")
      ))
    ));
    if (conflicts) continue;
    selected.push(plannedLane.laneId);
    reservations.push(
      ...laneByLaneId.get(plannedLane.laneId)!.resourceClaims,
    );
  }
  return selected;
}

describe("Task Map refresh plan contract", () => {
  it("exports explicit v1 draft, plan, lane, and batch versions", () => {
    assert.strictEqual(
      TASKMAP_REFRESH_PLAN_DRAFT_VERSION,
      "taskmap-refresh-plan-draft.v1",
    );
    assert.strictEqual(
      TASKMAP_REFRESH_PLAN_VERSION,
      "taskmap-refresh-plan.v1",
    );
    assert.strictEqual(
      TASKMAP_REFRESH_LANE_VERSION,
      "taskmap-refresh-lane.v1",
    );
    assert.strictEqual(
      TASKMAP_REFRESH_BATCH_VERSION,
      "taskmap-refresh-ready-batch.v1",
    );
    assert.strictEqual(
      TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION,
      "taskmap-owner-review-attestation.v2",
    );
    assert.deepStrictEqual(TASKMAP_REFRESH_PLAN_LIMITS_V1, {
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
    });
  });

  it("canonicalizes every set-like input and produces byte-identical plans", () => {
    const firstDraft = canonicalDraft();
    const reordered = structuredClone(firstDraft);
    reordered.baseline.priorCheckpointDigests.reverse();
    reordered.baseline.priorSourceSliceDigests.reverse();
    reordered.baseline.acceptedSourceRevisions.reverse();
    reordered.baseline.acceptedSourceRevisionSets.reverse();
    reordered.baseline.acceptedSemanticInputDigests.reverse();
    reordered.sourceBindings.reverse();
    reordered.sourceRevisions.reverse();
    reordered.sourceRevisionSets.reverse();
    reordered.semanticInputDigests.reverse();
    reordered.policyBindings.reverse();
    reordered.lanes.reverse();
    for (const item of reordered.lanes) {
      item.priorityReasonCodes.reverse();
      item.predecessorLaneIds.reverse();
      item.resourceClaims.reverse();
      item.inputDigests.reverse();
      item.outputKinds.reverse();
    }

    const first = buildTaskMapRefreshPlan(firstDraft);
    const second = buildTaskMapRefreshPlan(reordered);
    assert.deepStrictEqual(second, first);
    assert.strictEqual(JSON.stringify(second), JSON.stringify(first));
    assert.match(first.planId, /^tmrefreshplan_[a-f0-9]{64}$/);
    assert.ok(Object.isFrozen(first));
    assert.ok(Object.isFrozen(first.lanes));
  });

  it("keeps 100 seeded plan and batch permutations byte-identical", () => {
    const expectedPlan = buildTaskMapRefreshPlan(canonicalDraft());
    const expectedStates = laneStates(expectedPlan, {
      [LANE_IDS.collectCalendar]: { status: "succeeded" },
      [LANE_IDS.collectGranola]: { status: "succeeded" },
    });
    const expectedBatch = selectTaskMapReadyBatch(expectedPlan, {
      maxConcurrency: 4,
      laneStates: expectedStates,
    });

    for (let seed = 1; seed <= 100; seed += 1) {
      const plan = buildTaskMapRefreshPlan(permutedDraft(seed));
      const states = structuredClone(expectedStates);
      shuffleInPlace(states, seededRandom(seed ^ 0x5eed));
      const batch = selectTaskMapReadyBatch(plan, {
        maxConcurrency: 4,
        laneStates: states,
      });
      assert.strictEqual(
        JSON.stringify(plan),
        JSON.stringify(expectedPlan),
        `plan permutation ${seed}`,
      );
      assert.strictEqual(
        JSON.stringify(batch),
        JSON.stringify(expectedBatch),
        `batch permutation ${seed}`,
      );
    }
  });

  it("rejects oversize lane child arrays before Set construction and accepts their raw limits", () => {
    const nearLimit = canonicalDraft();
    const collect = laneById(nearLimit, LANE_IDS.collectCalendar);
    collect.priorityReasonCodes = Array(
      TASKMAP_REFRESH_PLAN_LIMITS_V1.maxPriorityReasonCodesPerLane,
    ).fill("source_freshness");
    collect.outputKinds = Array.from(
      {
        length:
          TASKMAP_REFRESH_PLAN_LIMITS_V1.maxOutputKindsPerLane,
      },
      (_, index) => (
        index % 2 === 0 ? "connector_checkpoint" : "source_slice"
      ),
    );
    const nearPlan = buildTaskMapRefreshPlan(nearLimit);
    assert.deepStrictEqual(
      planLaneById(
        nearPlan,
        LANE_IDS.collectCalendar,
      ).priorityReasonCodes,
      ["source_freshness"],
    );
    assert.deepStrictEqual(
      planLaneById(nearPlan, LANE_IDS.collectCalendar).outputKinds,
      ["connector_checkpoint", "source_slice"],
    );

    const oversizePriority = canonicalDraft();
    laneById(
      oversizePriority,
      LANE_IDS.collectCalendar,
    ).priorityReasonCodes = [
      "unknown_reason" as RefreshLaneDraft["priorityReasonCodes"][number],
      ...Array(
        TASKMAP_REFRESH_PLAN_LIMITS_V1
          .maxPriorityReasonCodesPerLane,
      ).fill("source_freshness"),
    ];
    assert.throws(
      () => buildTaskMapRefreshPlan(oversizePriority),
      /priorityReasonCodes exceed the per-lane bound of 64/i,
    );

    const oversizeOutputs = canonicalDraft();
    laneById(oversizeOutputs, LANE_IDS.collectCalendar).outputKinds = [
      "unknown_output" as RefreshLaneDraft["outputKinds"][number],
      ...Array(
        TASKMAP_REFRESH_PLAN_LIMITS_V1.maxOutputKindsPerLane,
      ).fill("connector_checkpoint"),
    ];
    assert.throws(
      () => buildTaskMapRefreshPlan(oversizeOutputs),
      /outputKinds exceed the per-lane bound of 64/i,
    );

    const oversizeInputs = canonicalDraft();
    laneById(oversizeInputs, LANE_IDS.identityBarrier).inputDigests =
      Array(
        TASKMAP_REFRESH_PLAN_LIMITS_V1.maxInputDigestsPerLane + 1,
      ).fill("not-a-digest");
    assert.throws(
      () => buildTaskMapRefreshPlan(oversizeInputs),
      /lane inputDigests exceed the per-lane bound of 256/i,
    );

    const oversizePredecessors = canonicalDraft();
    laneById(
      oversizePredecessors,
      LANE_IDS.identityBarrier,
    ).predecessorLaneIds = Array(
      TASKMAP_REFRESH_PLAN_LIMITS_V1.maxPredecessorsPerLane + 1,
    ).fill("NOT A SAFE IDENTIFIER");
    assert.throws(
      () => buildTaskMapRefreshPlan(oversizePredecessors),
      /predecessorLaneIds exceed the per-lane bound of 256/i,
    );
  });

  it("rejects lane count before mapping and accepts a valid 1024-lane plan", () => {
    const rawOversize = canonicalDraft();
    rawOversize.lanes = Array(
      TASKMAP_REFRESH_PLAN_LIMITS_V1.maxLanes + 1,
    ).fill(null) as unknown as RefreshLaneDraft[];
    assert.throws(
      () => buildTaskMapRefreshPlan(rawOversize),
      /bounded non-empty lane set/i,
    );

    const nearLimit = canonicalDraft();
    while (
      nearLimit.lanes.length
      < TASKMAP_REFRESH_PLAN_LIMITS_V1.maxLanes
    ) {
      nearLimit.lanes.push(optionalAuditLane(
        `lane-bound-${nearLimit.lanes.length}`,
      ));
    }
    assert.strictEqual(
      buildTaskMapRefreshPlan(nearLimit).lanes.length,
      TASKMAP_REFRESH_PLAN_LIMITS_V1.maxLanes,
    );
  });

  it("enforces aggregate input and predecessor caps before normalization with exact-limit controls", () => {
    const exactInputs = draftAtAggregateInputLimit();
    assert.strictEqual(
      rawLaneArrayItemCount(exactInputs, "inputDigests"),
      TASKMAP_REFRESH_PLAN_LIMITS_V1.maxTotalInputDigests,
    );
    assert.doesNotThrow(() => buildTaskMapRefreshPlan(exactInputs));

    const tooManyInputs = structuredClone(exactInputs);
    tooManyInputs.lanes[0].goal =
      "invalid_goal" as RefreshLaneDraft["goal"];
    tooManyInputs.lanes.at(-1)!.inputDigests.push(
      digest("one-input-over-the-aggregate-limit"),
    );
    assert.throws(
      () => buildTaskMapRefreshPlan(tooManyInputs),
      /exceeds 4096 total lane input digests/i,
    );

    const exactEdges = draftAtAggregatePredecessorLimit();
    assert.strictEqual(
      rawLaneArrayItemCount(exactEdges, "predecessorLaneIds"),
      TASKMAP_REFRESH_PLAN_LIMITS_V1.maxTotalPredecessorEdges,
    );
    assert.doesNotThrow(() => buildTaskMapRefreshPlan(exactEdges));

    const tooManyEdges = structuredClone(exactEdges);
    tooManyEdges.lanes[0].goal =
      "invalid_goal" as RefreshLaneDraft["goal"];
    const finalConsumer = tooManyEdges.lanes.at(-1)!;
    finalConsumer.predecessorLaneIds.push("edge-producer-255");
    assert.throws(
      () => buildTaskMapRefreshPlan(tooManyEdges),
      /exceeds 4096 predecessor edges/i,
    );
  });

  it("enforces the aggregate resource-claim cap with an exact-limit control", () => {
    const exact = canonicalDraft();
    const remainingClaims = (
      TASKMAP_REFRESH_PLAN_LIMITS_V1.maxTotalResourceClaims
      - rawLaneArrayItemCount(exact, "resourceClaims")
    );
    exact.lanes.push(optionalAuditLane("claim-bound-control", {
      resourceClaims: Array.from(
        { length: remainingClaims },
        (_, index) => ({
          resourceId:
            `audit:claim-bound:${String(index).padStart(4, "0")}`,
          mode: "shared" as const,
        }),
      ),
    }));
    assert.strictEqual(
      rawLaneArrayItemCount(exact, "resourceClaims"),
      TASKMAP_REFRESH_PLAN_LIMITS_V1.maxTotalResourceClaims,
    );
    assert.doesNotThrow(() => buildTaskMapRefreshPlan(exact));

    const tooMany = structuredClone(exact);
    tooMany.lanes[0].goal =
      "invalid_goal" as RefreshLaneDraft["goal"];
    tooMany.lanes.at(-1)!.resourceClaims.push({
      resourceId: "audit:claim-bound:over",
      mode: "shared",
    });
    assert.throws(
      () => buildTaskMapRefreshPlan(tooMany),
      /exceeds 4096 total resource claims/i,
    );
  });

  it("rejects a normalized canonical plan above the 4 MiB member ceiling", () => {
    const draft = canonicalDraft();
    draft.baseline.acceptedSourceRevisions = Array.from(
      { length: 4_096 },
      (_, index) => ({
        bindingDigest: index % 2 === 0
          ? SOURCE_ARTIFACTS.calendar.bindingDigest
          : SOURCE_ARTIFACTS.granola.bindingDigest,
        sourceIdentityDigest: digest(`large-accepted-identity-${index}`),
        sourceRevisionDigest: digest(`large-accepted-revision-${index}`),
        contentDigest: digest(`large-accepted-content-${index}`),
      }),
    );
    draft.baseline.acceptedSourceRevisionSets = revisionSetsFor(
      draft.baseline.acceptedSourceRevisions,
      draft.baseline.priorProviderArtifacts.map(
        (artifact) => artifact.bindingDigest,
      ),
    );
    draft.semanticInputDigests = Array.from(
      { length: 4_096 },
      (_, index) => digest(`large-current-semantic-${index}`),
    );
    draft.baseline.acceptedSemanticInputDigests = Array.from(
      { length: 4_096 },
      (_, index) => digest(`large-accepted-semantic-${index}`),
    );

    const rootLaneIds: string[] = [];
    const coreLaneCount = draft.lanes.length;
    while (draft.lanes.length < TASKMAP_REFRESH_PLAN_LIMITS_V1.maxLanes) {
      const index = draft.lanes.length - coreLaneCount;
      const laneId = longSafeIdentifier("oversizelane", index);
      if (rootLaneIds.length < 4) rootLaneIds.push(laneId);
      draft.lanes.push(optionalAuditLane(laneId, {
        operationVersion: longSafeIdentifier("operation", index),
        predecessorLaneIds: index < 4 ? [] : [...rootLaneIds],
        resourceClaims: Array.from({ length: 4 }, (_, claimIndex) => ({
          resourceId: longSafeIdentifier(
            "resource",
            index * 4 + claimIndex,
          ),
          mode: "shared" as const,
        })),
        inputDigests: Array.from(
          { length: 4 },
          (_, inputIndex) => digest(`large-lane-input-${index}-${inputIndex}`),
        ),
      }));
    }
    assert.ok(
      rawLaneArrayItemCount(draft, "inputDigests")
      <= TASKMAP_REFRESH_PLAN_LIMITS_V1.maxTotalInputDigests,
    );
    assert.ok(
      rawLaneArrayItemCount(draft, "predecessorLaneIds")
      <= TASKMAP_REFRESH_PLAN_LIMITS_V1.maxTotalPredecessorEdges,
    );
    assert.ok(
      rawLaneArrayItemCount(draft, "resourceClaims")
      <= TASKMAP_REFRESH_PLAN_LIMITS_V1.maxTotalResourceClaims,
    );
    assert.throws(
      () => buildTaskMapRefreshPlan(draft),
      /canonical refresh plan exceeds 4194304 bytes/i,
    );
  });

  it("rejects forged derived fields through assertTaskMapRefreshPlan", () => {
    const plan = buildTaskMapRefreshPlan(canonicalDraft());
    const mutations: Array<[string, (value: JsonRecord) => void]> = [
      ["planId", (value) => {
        value.planId = `tmrefreshplan_${digest("forged-plan-id")}`;
      }],
      ["laneDigest", (value) => {
        ((value.lanes as JsonRecord[])[0]).laneDigest =
          digest("forged-lane-digest");
      }],
      ["candidateAcceptedStateDigest", (value) => {
        value.candidateAcceptedStateDigest =
          digest("forged-candidate-accepted-state");
      }],
      ["semanticImplementationDigest", (value) => {
        value.semanticImplementationDigest =
          digest("forged-semantic-implementation");
      }],
      ["reviewedEvidenceDigest", (value) => {
        value.reviewedEvidenceDigest =
          digest("forged-reviewed-evidence");
      }],
      ["policyBundleDigest", (value) => {
        value.policyBundleDigest = digest("forged-policy-bundle");
      }],
      ["sourceRevisionDigests", (value) => {
        value.sourceRevisionDigests = [
          digest("forged-source-revision-set"),
        ];
      }],
      ["isExactNoOp", (value) => {
        value.isExactNoOp = true;
      }],
      ["privacy", (value) => {
        (value.privacy as JsonRecord).participantDetailsStored = true;
      }],
      ["refreshReasonCodes", (value) => {
        value.refreshReasonCodes = ["genesis"];
      }],
      ["barrierPolicyVersion", (value) => {
        value.barrierPolicyVersion =
          "taskmap-refresh-all-settled-barrier.2";
      }],
      ["requirednessPolicyVersion", (value) => {
        value.requirednessPolicyVersion =
          "taskmap-refresh-requiredness.2";
      }],
      ["schedulingPolicyVersion", (value) => {
        value.schedulingPolicyVersion =
          "taskmap-refresh-scheduling.2";
      }],
      ["lane priority policy", (value) => {
        ((value.lanes as JsonRecord[])[0]).priorityReasonCodes = [
          "privacy_safety",
        ];
      }],
    ];

    for (const [label, mutate] of mutations) {
      const forged = structuredClone(plan) as unknown as JsonRecord;
      mutate(forged);
      assert.throws(
        () => assertTaskMapRefreshPlan(
          forged as unknown as RefreshPlan,
        ),
        /canonical|derived|invalid|policy|priority/i,
        label,
      );
    }
  });

  it("rejects oversized forged plans before validator iteration or cloning", () => {
    const plan = buildTaskMapRefreshPlan(canonicalDraft());

    const tooManyLanes = structuredClone(plan) as unknown as JsonRecord;
    tooManyLanes.lanes = Array(
      TASKMAP_REFRESH_PLAN_LIMITS_V1.maxLanes + 1,
    ).fill(null);
    assert.throws(
      () => assertTaskMapRefreshPlan(
        tooManyLanes as unknown as RefreshPlan,
      ),
      /bounded non-empty lane set/i,
    );

    const oversizedLaneChild =
      structuredClone(plan) as unknown as JsonRecord;
    ((oversizedLaneChild.lanes as JsonRecord[])[0])
      .priorityReasonCodes = Array(
        TASKMAP_REFRESH_PLAN_LIMITS_V1
          .maxPriorityReasonCodesPerLane + 1,
      ).fill("unknown_reason");
    assert.throws(
      () => assertTaskMapRefreshPlan(
        oversizedLaneChild as unknown as RefreshPlan,
      ),
      /priorityReasonCodes exceed the per-lane bound of 64/i,
    );

    const oversizedTopLevel =
      structuredClone(plan) as unknown as JsonRecord;
    oversizedTopLevel.semanticInputDigests = Array(
      4_097,
    ).fill("not-a-digest");
    assert.throws(
      () => assertTaskMapRefreshPlan(
        oversizedTopLevel as unknown as RefreshPlan,
      ),
      /semanticInputDigests exceeds its raw array bound of 4096/i,
    );

    const oversizedBaseline =
      structuredClone(plan) as unknown as JsonRecord;
    (oversizedBaseline.baseline as JsonRecord)
      .acceptedSourceRevisions = Array(4_097).fill(null);
    assert.throws(
      () => assertTaskMapRefreshPlan(
        oversizedBaseline as unknown as RefreshPlan,
      ),
      /acceptedSourceRevisions exceeds its raw array bound of 4096/i,
    );

    const oversizedNodeGraph =
      structuredClone(plan) as unknown as JsonRecord;
    ((oversizedNodeGraph.sourceBindings as JsonRecord[])[0])
      .adapterVersion = Array(
        TASKMAP_REFRESH_PLAN_LIMITS_V1.maxRawNodes + 1,
      ).fill(0);
    assert.throws(
      () => assertTaskMapRefreshPlan(
        oversizedNodeGraph as unknown as RefreshPlan,
      ),
      /raw node budget 131072/i,
    );

    const oversizedObject =
      structuredClone(plan) as unknown as JsonRecord;
    ((oversizedObject.sourceBindings as JsonRecord[])[0])
      .adapterVersion = Object.fromEntries(
        Array.from(
          {
            length:
              TASKMAP_REFRESH_PLAN_LIMITS_V1.maxRawObjectKeys + 1,
          },
          (_, index) => [`key${index}`, 0],
        ),
      );
    assert.throws(
      () => assertTaskMapRefreshPlan(
        oversizedObject as unknown as RefreshPlan,
      ),
      /object exceeds 64 keys/i,
    );

    const accessorBacked =
      structuredClone(plan) as unknown as JsonRecord;
    let accessorReads = 0;
    Object.defineProperty(
      (accessorBacked.lanes as JsonRecord[])[0],
      "operationVersion",
      {
        enumerable: true,
        configurable: true,
        get: () => {
          accessorReads += 1;
          return "forged-accessor.1";
        },
      },
    );
    assert.throws(
      () => assertTaskMapRefreshPlan(
        accessorBacked as unknown as RefreshPlan,
      ),
      /accessor-backed values/i,
    );
    assert.strictEqual(accessorReads, 0);

    const hiddenAccessor =
      structuredClone(plan) as unknown as JsonRecord;
    const originalLanes = hiddenAccessor.lanes;
    let hiddenAccessorReads = 0;
    Object.defineProperty(hiddenAccessor, "lanes", {
      enumerable: false,
      configurable: true,
      get: () => {
        hiddenAccessorReads += 1;
        return originalLanes;
      },
    });
    assert.throws(
      () => assertTaskMapRefreshPlan(
        hiddenAccessor as unknown as RefreshPlan,
      ),
      /accessor-backed values/i,
    );
    assert.strictEqual(hiddenAccessorReads, 0);

    const symbolBacked =
      structuredClone(plan) as unknown as JsonRecord;
    let iteratorReads = 0;
    Object.defineProperty(
      symbolBacked.lanes as unknown[],
      Symbol.iterator,
      {
        enumerable: false,
        configurable: true,
        get: () => {
          iteratorReads += 1;
          return Array.prototype[Symbol.iterator];
        },
      },
    );
    assert.throws(
      () => assertTaskMapRefreshPlan(
        symbolBacked as unknown as RefreshPlan,
      ),
      /symbol-keyed values/i,
    );
    assert.strictEqual(iteratorReads, 0);

    for (const mutate of [
      (value: JsonRecord) => {
        ((value.lanes as JsonRecord[])[0]).operationVersion =
          `operation${"x".repeat(
            TASKMAP_REFRESH_PLAN_LIMITS_V1.maxRawStringBytes,
          )}`;
      },
      (value: JsonRecord) => {
        const firstLane = (value.lanes as JsonRecord[])[0];
        ((firstLane.resourceClaims as JsonRecord[])[0]).resourceId =
          `resource:${"x".repeat(
            TASKMAP_REFRESH_PLAN_LIMITS_V1.maxRawStringBytes,
          )}`;
      },
    ]) {
      const oversizedScalar =
        structuredClone(plan) as unknown as JsonRecord;
      mutate(oversizedScalar);
      assert.throws(
        () => assertTaskMapRefreshPlan(
          oversizedScalar as unknown as RefreshPlan,
        ),
        /raw string exceeds 4096 bytes/i,
      );
    }

    const aggregateInputPlan =
      buildTaskMapRefreshPlan(draftAtAggregateInputLimit());
    const oversizedAggregate =
      structuredClone(aggregateInputPlan) as unknown as JsonRecord;
    ((oversizedAggregate.lanes as JsonRecord[]).at(-1)!
      .inputDigests as string[]).push(
      digest("validator-aggregate-input-over"),
    );
    assert.throws(
      () => assertTaskMapRefreshPlan(
        oversizedAggregate as unknown as RefreshPlan,
      ),
      /exceeds 4096 total lane input digests/i,
    );
  });

  it("descriptor-first preflights untrusted drafts before any property read", () => {
    const wideUnknown = canonicalDraft() as unknown as JsonRecord;
    wideUnknown.unexpectedWide = Object.fromEntries(
      Array.from(
        {
          length:
            TASKMAP_REFRESH_PLAN_LIMITS_V1.maxRawObjectKeys + 1,
        },
        (_, index) => [`unknown${index}`, 0],
      ),
    );
    assert.throws(
      () => buildTaskMapRefreshPlan(
        wideUnknown as unknown as TaskMapRefreshPlanDraftV1,
      ),
      /object exceeds 64 keys/i,
    );

    const hugeScalar = canonicalDraft() as unknown as JsonRecord;
    hugeScalar.ownerScopeDigest = "x".repeat(
      TASKMAP_REFRESH_PLAN_LIMITS_V1.maxRawStringBytes + 1,
    );
    assert.throws(
      () => buildTaskMapRefreshPlan(
        hugeScalar as unknown as TaskMapRefreshPlanDraftV1,
      ),
      /raw string exceeds 4096 bytes/i,
    );

    const nested = canonicalDraft() as unknown as JsonRecord;
    let nestedValue: unknown = 0;
    for (
      let depth = 0;
      depth < TASKMAP_REFRESH_PLAN_LIMITS_V1.maxRawNestingDepth + 2;
      depth += 1
    ) {
      nestedValue = [nestedValue];
    }
    nested.unexpectedNested = nestedValue;
    assert.throws(
      () => buildTaskMapRefreshPlan(
        nested as unknown as TaskMapRefreshPlanDraftV1,
      ),
      /raw nesting depth 64/i,
    );

    const topLevelAccessor =
      canonicalDraft() as unknown as JsonRecord;
    const originalContractVersion = topLevelAccessor.contractVersion;
    let topLevelReads = 0;
    Object.defineProperty(topLevelAccessor, "contractVersion", {
      enumerable: true,
      configurable: true,
      get: () => {
        topLevelReads += 1;
        return originalContractVersion;
      },
    });
    assert.throws(
      () => buildTaskMapRefreshPlan(
        topLevelAccessor as unknown as TaskMapRefreshPlanDraftV1,
      ),
      /accessor-backed values/i,
    );
    assert.strictEqual(topLevelReads, 0);

    const symbolBacked = canonicalDraft() as unknown as JsonRecord;
    let symbolReads = 0;
    Object.defineProperty(symbolBacked, Symbol("forged-draft"), {
      enumerable: false,
      configurable: true,
      get: () => {
        symbolReads += 1;
        return true;
      },
    });
    assert.throws(
      () => buildTaskMapRefreshPlan(
        symbolBacked as unknown as TaskMapRefreshPlanDraftV1,
      ),
      /symbol-keyed values/i,
    );
    assert.strictEqual(symbolReads, 0);

    const hidden = canonicalDraft() as unknown as JsonRecord;
    Object.defineProperty(hidden, "hiddenDraftField", {
      enumerable: false,
      configurable: true,
      value: true,
    });
    assert.throws(
      () => buildTaskMapRefreshPlan(
        hidden as unknown as TaskMapRefreshPlanDraftV1,
      ),
      /hidden properties/i,
    );

    const sparse = canonicalDraft() as unknown as JsonRecord;
    const sparseLanes = new Array(
      (sparse.lanes as unknown[]).length + 1,
    );
    sparseLanes[0] = (sparse.lanes as unknown[])[0];
    for (
      let index = 1;
      index < (sparse.lanes as unknown[]).length;
      index += 1
    ) {
      sparseLanes[index + 1] = (sparse.lanes as unknown[])[index];
    }
    sparse.lanes = sparseLanes;
    assert.throws(
      () => buildTaskMapRefreshPlan(
        sparse as unknown as TaskMapRefreshPlanDraftV1,
      ),
      /holes or hidden elements/i,
    );

    const cyclic = canonicalDraft() as unknown as JsonRecord;
    cyclic.unexpectedCycle = cyclic;
    assert.throws(
      () => buildTaskMapRefreshPlan(
        cyclic as unknown as TaskMapRefreshPlanDraftV1,
      ),
      /cyclic values/i,
    );

    const proxiedDraft = canonicalDraft();
    let draftProxyReads = 0;
    proxiedDraft.lanes = new Proxy(proxiedDraft.lanes, {
      get: (target, property, receiver) => {
        draftProxyReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    assert.throws(
      () => buildTaskMapRefreshPlan(proxiedDraft),
      /cannot be snapshotted as plain JSON data/i,
    );
    assert.strictEqual(draftProxyReads, 0);
  });

  it("rejects a Proxy-backed built plan without executing get traps", () => {
    const plan = buildTaskMapRefreshPlan(canonicalDraft());
    let planProxyReads = 0;
    const proxiedPlan = new Proxy(plan, {
      get: (target, property, receiver) => {
        planProxyReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    assert.throws(
      () => assertTaskMapRefreshPlan(proxiedPlan),
      /cannot be snapshotted as plain JSON data/i,
    );
    assert.strictEqual(planProxyReads, 0);
  });

  it("snapshots each public refresh-plan boundary exactly once", () => {
    const originalStructuredClone = globalThis.structuredClone;
    let cloneCalls = 0;
    globalThis.structuredClone = ((
      value: Parameters<typeof structuredClone>[0],
    ) => {
      cloneCalls += 1;
      return originalStructuredClone(value);
    }) as typeof structuredClone;
    try {
      const plan = buildTaskMapRefreshPlan(canonicalDraft());
      assert.strictEqual(cloneCalls, 1);

      cloneCalls = 0;
      assertTaskMapRefreshPlan(plan);
      assert.strictEqual(cloneCalls, 1);

      cloneCalls = 0;
      selectTaskMapReadyBatch(plan, {
        maxConcurrency: 2,
        laneStates: laneStates(plan),
      });
      assert.strictEqual(cloneCalls, 1);
    } finally {
      globalThis.structuredClone = originalStructuredClone;
    }
  });

  it("binds the exact review-attestation version and ignores reviewed-field order", () => {
    const first = buildTaskMapRefreshPlan(canonicalDraft());
    const reordered = canonicalDraft();
    reordered.reviewedDigests = {
      sourceManifestDigest: REVIEWED_DIGESTS.sourceManifestDigest,
      reviewAttestationDigest: REVIEWED_DIGESTS.reviewAttestationDigest,
      reviewAttestationVersion:
        TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION,
      reviewBatchDigest: REVIEWED_DIGESTS.reviewBatchDigest,
      truthSetDigest: REVIEWED_DIGESTS.truthSetDigest,
    };
    const second = buildTaskMapRefreshPlan(reordered);
    assert.strictEqual(second.planId, first.planId);
    assert.strictEqual(
      second.reviewedEvidenceDigest,
      first.reviewedEvidenceDigest,
    );

    const wrongVersion = canonicalDraft() as unknown as JsonRecord;
    (wrongVersion.reviewedDigests as JsonRecord)
      .reviewAttestationVersion = "taskmap-owner-review-attestation.v1";
    assert.throws(
      () => buildTaskMapRefreshPlan(
        wrongVersion as unknown as TaskMapRefreshPlanDraftV1,
      ),
      /review attestation version.*unsupported/i,
    );

    const unknownField = canonicalDraft() as unknown as JsonRecord;
    (unknownField.reviewedDigests as JsonRecord).reviewerIdentity =
      digest("must-not-enter-contract");
    assert.throws(
      () => buildTaskMapRefreshPlan(
        unknownField as unknown as TaskMapRefreshPlanDraftV1,
      ),
      /reviewed digests.*unknown|forbidden.*reviewerIdentity/i,
    );
  });

  it("rejects duplicate lanes, missing predecessors, self edges, and cycles", () => {
    const duplicate = canonicalDraft();
    duplicate.lanes.push(structuredClone(duplicate.lanes[0]));
    assert.throws(
      () => buildTaskMapRefreshPlan(duplicate),
      /duplicate.*lane|lane.*duplicate/i,
    );

    const missing = canonicalDraft();
    laneById(missing, LANE_IDS.identityBarrier)
      .predecessorLaneIds.push("missing-normalizer");
    assert.throws(
      () => buildTaskMapRefreshPlan(missing),
      /missing|unknown.*predecessor/i,
    );

    const self = canonicalDraft();
    laneById(self, LANE_IDS.normalizeCalendar)
      .predecessorLaneIds.push(LANE_IDS.normalizeCalendar);
    assert.throws(
      () => buildTaskMapRefreshPlan(self),
      /self|cycle/i,
    );

    const cycle = canonicalDraft();
    laneById(cycle, LANE_IDS.collectCalendar)
      .predecessorLaneIds.push(LANE_IDS.publication);
    assert.throws(
      () => buildTaskMapRefreshPlan(cycle),
      /cycle/i,
    );
  });

  it("rejects an incomplete all-settled barrier and direct pre-barrier bypass", () => {
    const omittedNormalizer = canonicalDraft();
    laneById(omittedNormalizer, LANE_IDS.identityBarrier)
      .predecessorLaneIds = [LANE_IDS.normalizeCalendar];
    assert.throws(
      () => buildTaskMapRefreshPlan(omittedNormalizer),
      /barrier must directly all-settle every normalization lane/i,
    );

    const directBypass = canonicalDraft();
    laneById(directBypass, LANE_IDS.authorityGate)
      .predecessorLaneIds.push(LANE_IDS.normalizeCalendar);
    assert.throws(
      () => buildTaskMapRefreshPlan(directBypass),
      /downstream lanes cannot consume pre-barrier outputs/i,
    );
  });

  it("keeps every provider ancestor binding-local until the barrier", () => {
    const crossBindingCases: Array<[
      string,
      (draft: TaskMapRefreshPlanDraftV1) => void,
    ]> = [
      ["crossed replacement", (draft) => {
        laneById(
          draft,
          LANE_IDS.normalizeCalendar,
        ).predecessorLaneIds = [LANE_IDS.collectGranola];
        laneById(
          draft,
          LANE_IDS.normalizeGranola,
        ).predecessorLaneIds = [LANE_IDS.collectCalendar];
      }],
      ["additive collect predecessor", (draft) => {
        laneById(
          draft,
          LANE_IDS.normalizeCalendar,
        ).predecessorLaneIds.push(LANE_IDS.collectGranola);
      }],
      ["cross-binding collect chain", (draft) => {
        laneById(
          draft,
          LANE_IDS.collectGranola,
        ).predecessorLaneIds.push(LANE_IDS.collectCalendar);
      }],
      ["cross-binding normalize chain", (draft) => {
        laneById(
          draft,
          LANE_IDS.normalizeGranola,
        ).predecessorLaneIds.push(LANE_IDS.normalizeCalendar);
      }],
    ];
    for (const [label, mutate] of crossBindingCases) {
      const draft = canonicalDraft();
      mutate(draft);
      assert.throws(
        () => buildTaskMapRefreshPlan(draft),
        /binding-local|same-binding|cross-binding/i,
        label,
      );
    }

    const sameBindingChain = canonicalDraft();
    sameBindingChain.lanes.push(lane({
      laneId: "collect-google-calendar-bootstrap",
      goal: "provider_collect",
      operationVersion: "google-calendar-bootstrap.1",
      priority: "P0",
      priorityReasonCodes: ["source_freshness"],
      predecessorLaneIds: [],
      resourceClaims: [{
        resourceId: "provider:google_calendar",
        mode: "shared",
      }],
      effect: "read_only",
      requiredForPublication: true,
      inputDigests: [
        SOURCE_ARTIFACTS.calendar.bindingDigest,
        SOURCE_ARTIFACTS.calendar.priorCheckpointDigest,
        SOURCE_ARTIFACTS.calendar.priorSourceSliceDigest,
      ],
      outputKinds: ["connector_checkpoint", "source_slice"],
    }));
    laneById(
      sameBindingChain,
      LANE_IDS.collectCalendar,
    ).predecessorLaneIds = ["collect-google-calendar-bootstrap"];
    assert.doesNotThrow(
      () => buildTaskMapRefreshPlan(sameBindingChain),
    );
  });

  it("derives core requiredness and rejects a caller-forged false value", () => {
    const plan = buildTaskMapRefreshPlan(canonicalDraft());
    for (const item of plan.lanes) {
      assert.strictEqual(
        item.requiredForPublication,
        true,
        `${item.laneId} is a core publication lane`,
      );
    }

    const forged = canonicalDraft();
    laneById(forged, LANE_IDS.identityBarrier).requiredForPublication = false;
    assert.throws(
      () => buildTaskMapRefreshPlan(forged),
      /requiredForPublication|core.*required/i,
    );
  });

  it("derives core versus optional priority classes from closed stages", () => {
    const downgradedCore = canonicalDraft();
    const authorityGate = laneById(
      downgradedCore,
      LANE_IDS.authorityGate,
    );
    authorityGate.priority = "P1";
    authorityGate.priorityReasonCodes = ["connector_visibility"];
    assert.throws(
      () => buildTaskMapRefreshPlan(downgradedCore),
      /policy-derived from stage|priority/i,
    );

    const upgradedOptional = canonicalDraft();
    upgradedOptional.lanes.push(lane({
      laneId: "optional-priority-forgery",
      goal: "refresh_audit",
      operationVersion: "optional-priority-forgery.1",
      priority: "P0",
      priorityReasonCodes: ["source_freshness"],
      predecessorLaneIds: [LANE_IDS.projection],
      resourceClaims: [{
        resourceId: "optional:priority-forgery",
        mode: "shared",
      }],
      effect: "read_only",
      requiredForPublication: false,
      inputDigests: [digest("optional-priority-forgery")],
      outputKinds: ["refresh_audit"],
    }));
    assert.throws(
      () => buildTaskMapRefreshPlan(upgradedOptional),
      /policy-derived from stage|priority/i,
    );
  });

  it("canonicalizes identical claims and rejects contradictory modes", () => {
    const base = buildTaskMapRefreshPlan(canonicalDraft());
    const duplicated = canonicalDraft();
    const duplicatedLane = laneById(
      duplicated,
      LANE_IDS.collectCalendar,
    );
    duplicatedLane.resourceClaims.push(
      structuredClone(duplicatedLane.resourceClaims[0]),
    );
    const canonical = buildTaskMapRefreshPlan(duplicated);
    assert.strictEqual(canonical.planId, base.planId);
    assert.deepStrictEqual(
      planLaneById(canonical, LANE_IDS.collectCalendar).resourceClaims,
      planLaneById(base, LANE_IDS.collectCalendar).resourceClaims,
    );

    const contradictory = canonicalDraft();
    const contradictoryLane = laneById(
      contradictory,
      LANE_IDS.collectCalendar,
    );
    contradictoryLane.resourceClaims.push({
      resourceId: contradictoryLane.resourceClaims[0].resourceId,
      mode: "exclusive",
    });
    assert.throws(
      () => buildTaskMapRefreshPlan(contradictory),
      /contradictory.*shared.*exclusive/i,
    );
  });

  it("requires explicit claims and an exclusive external-mutation claim", () => {
    assert.doesNotThrow(
      () => buildTaskMapRefreshPlan(canonicalDraft()),
      "parallel canonical provider/normalization claims remain valid",
    );

    for (const [label, laneId] of [
      ["read_only", LANE_IDS.collectCalendar],
      ["local_state", LANE_IDS.normalizeCalendar],
    ] as const) {
      const draft = canonicalDraft();
      laneById(draft, laneId).resourceClaims = [];
      assert.throws(
        () => buildTaskMapRefreshPlan(draft),
        /resource claims.*must not be empty|at least one resource claim/i,
        label,
      );
    }

    const emptyExternal = canonicalDraft();
    const emptyExternalPublication = laneById(
      emptyExternal,
      LANE_IDS.publication,
    );
    emptyExternalPublication.effect = "external_mutation";
    emptyExternalPublication.approvalGateId = "approval:publication";
    emptyExternalPublication.resourceClaims = [];
    assert.throws(
      () => buildTaskMapRefreshPlan(emptyExternal),
      /resource claims.*must not be empty|at least one resource claim/i,
    );

    const sharedOnlyExternal = canonicalDraft();
    const sharedOnlyPublication = laneById(
      sharedOnlyExternal,
      LANE_IDS.publication,
    );
    sharedOnlyPublication.effect = "external_mutation";
    sharedOnlyPublication.approvalGateId = "approval:publication";
    sharedOnlyPublication.resourceClaims = [{
      resourceId: "taskmap:accepted-head",
      mode: "shared",
    }];
    assert.throws(
      () => buildTaskMapRefreshPlan(sharedOnlyExternal),
      /external_mutation.*exclusive|exclusive.*external_mutation/i,
    );
  });

  it("rejects the same source identity+revision with changed content", () => {
    const draft = canonicalDraft();
    const prior = draft.baseline.acceptedSourceRevisions[0];
    draft.sourceRevisions[0] = {
      bindingDigest: prior.bindingDigest,
      sourceIdentityDigest: prior.sourceIdentityDigest,
      sourceRevisionDigest: prior.sourceRevisionDigest,
      contentDigest: digest("forged-content-at-same-revision"),
    };
    draft.sourceRevisionSets = revisionSetsFor(
      draft.sourceRevisions,
      draft.sourceBindings.map((binding) => binding.bindingDigest),
    );
    assert.throws(
      () => buildTaskMapRefreshPlan(draft),
      /identical source identity and revision cannot change content/i,
    );
  });

  it("joins every source revision to a declared binding and binds reassignment into identity", () => {
    const undeclared = canonicalDraft();
    undeclared.sourceRevisions[0].bindingDigest =
      digest("undeclared-source-binding");
    assert.throws(
      () => buildTaskMapRefreshPlan(undeclared),
      /undeclared source binding|current source revision/i,
    );

    const base = buildTaskMapRefreshPlan(exactNoOpDraft());
    const reassigned = exactNoOpDraft();
    const firstBinding = reassigned.sourceRevisions[0].bindingDigest;
    reassigned.sourceRevisions[0].bindingDigest =
      reassigned.sourceRevisions[1].bindingDigest;
    reassigned.sourceRevisions[1].bindingDigest = firstBinding;
    reassigned.sourceRevisionSets = revisionSetsFor(
      reassigned.sourceRevisions,
      reassigned.sourceBindings.map((binding) => binding.bindingDigest),
    );
    const reassignedPlan = buildTaskMapRefreshPlan(reassigned);
    assert.strictEqual(reassignedPlan.isExactNoOp, false);
    assert.notStrictEqual(
      reassignedPlan.planId,
      base.planId,
    );
    assert.notStrictEqual(
      reassignedPlan.candidateAcceptedStateDigest,
      base.candidateAcceptedStateDigest,
    );
  });

  it("supports more than 253 same-binding revisions without provider-lane enumeration", () => {
    const draft = canonicalDraft();
    const calendarRevisions = Array.from({ length: 300 }, (_, index) => ({
      bindingDigest: SOURCE_ARTIFACTS.calendar.bindingDigest,
      sourceIdentityDigest: digest(`calendar-identity-${index}`),
      sourceRevisionDigest: digest(`calendar-revision-${index}`),
      contentDigest: digest(`calendar-content-${index}`),
    }));
    draft.sourceRevisions = [
      ...calendarRevisions,
      structuredClone(draft.sourceRevisions[1]),
    ];
    draft.sourceRevisionSets = revisionSetsFor(
      draft.sourceRevisions,
      draft.sourceBindings.map((binding) => binding.bindingDigest),
    );
    const first = buildTaskMapRefreshPlan(draft);
    const reordered = structuredClone(draft);
    reordered.sourceRevisions.reverse();
    const second = buildTaskMapRefreshPlan(reordered);

    assert.deepStrictEqual(second, first);
    assert.strictEqual(first.sourceRevisions.length, 301);
    assert.ok(
      Buffer.byteLength(JSON.stringify(first), "utf8")
      < TASKMAP_REFRESH_PLAN_LIMITS_V1.maxCanonicalPlanBytes,
    );
    for (const laneId of [
      LANE_IDS.collectCalendar,
      LANE_IDS.normalizeCalendar,
    ]) {
      assert.deepStrictEqual(
        planLaneById(first, laneId).inputDigests,
        [
          SOURCE_ARTIFACTS.calendar.bindingDigest,
          SOURCE_ARTIFACTS.calendar.priorCheckpointDigest,
          SOURCE_ARTIFACTS.calendar.priorSourceSliceDigest,
        ].sort(),
      );
    }
  });

  it("accepts a single active binding with a legitimate empty revision set", () => {
    const draft = canonicalDraft();
    draft.sourceBindings = draft.sourceBindings.filter(
      (binding) => (
        binding.bindingDigest === SOURCE_ARTIFACTS.calendar.bindingDigest
      ),
    );
    draft.sourceRevisions = [];
    draft.sourceRevisionSets = revisionSetsFor(
      draft.sourceRevisions,
      [SOURCE_ARTIFACTS.calendar.bindingDigest],
    );
    draft.baseline.priorCheckpointDigests = [
      SOURCE_ARTIFACTS.calendar.priorCheckpointDigest,
    ];
    draft.baseline.priorSourceSliceDigests = [
      SOURCE_ARTIFACTS.calendar.priorSourceSliceDigest,
    ];
    draft.baseline.priorProviderArtifacts =
      draft.baseline.priorProviderArtifacts.filter(
        (artifact) => (
          artifact.bindingDigest === SOURCE_ARTIFACTS.calendar.bindingDigest
        ),
      );
    draft.baseline.acceptedSourceRevisions =
      draft.baseline.acceptedSourceRevisions.filter(
        (revision) => (
          revision.bindingDigest === SOURCE_ARTIFACTS.calendar.bindingDigest
        ),
      );
    draft.baseline.acceptedSourceRevisionSets = revisionSetsFor(
      draft.baseline.acceptedSourceRevisions,
      [SOURCE_ARTIFACTS.calendar.bindingDigest],
    );
    draft.lanes = draft.lanes.filter((plannedLane) => (
      plannedLane.laneId !== LANE_IDS.collectGranola
      && plannedLane.laneId !== LANE_IDS.normalizeGranola
    ));
    laneById(
      draft,
      LANE_IDS.identityBarrier,
    ).predecessorLaneIds = [LANE_IDS.normalizeCalendar];

    const plan = buildTaskMapRefreshPlan(draft);
    assert.deepStrictEqual(plan.sourceRevisions, []);
    assert.deepStrictEqual(plan.sourceRevisionSets, [{
      bindingDigest: SOURCE_ARTIFACTS.calendar.bindingDigest,
      revisionSetDigest: taskMapContractDigest([]),
    }]);
    assert.strictEqual(plan.isExactNoOp, false);
    assert.ok(plan.refreshReasonCodes.includes("source_revision_changed"));
  });

  it("canonicalizes mixed empty/non-empty binding revision sets and compares them for no-op", () => {
    const draft = exactNoOpDraft();
    draft.sourceRevisions = draft.sourceRevisions.filter(
      (revision) => (
        revision.bindingDigest === SOURCE_ARTIFACTS.granola.bindingDigest
      ),
    );
    draft.sourceRevisionSets = revisionSetsFor(
      draft.sourceRevisions,
      draft.sourceBindings.map((binding) => binding.bindingDigest),
    );
    draft.baseline.acceptedSourceRevisions =
      structuredClone(draft.sourceRevisions);
    draft.baseline.acceptedSourceRevisionSets =
      structuredClone(draft.sourceRevisionSets);

    const first = buildTaskMapRefreshPlan(draft);
    const permuted = structuredClone(draft);
    permuted.sourceRevisionSets.reverse();
    permuted.baseline.acceptedSourceRevisionSets.reverse();
    const second = buildTaskMapRefreshPlan(permuted);
    assert.deepStrictEqual(second, first);
    assert.strictEqual(first.isExactNoOp, true);
    assert.deepStrictEqual(
      first.sourceRevisionSets.find(
        (revisionSet) => (
          revisionSet.bindingDigest
          === SOURCE_ARTIFACTS.calendar.bindingDigest
        ),
      ),
      {
        bindingDigest: SOURCE_ARTIFACTS.calendar.bindingDigest,
        revisionSetDigest: taskMapContractDigest([]),
      },
    );

    const changed = structuredClone(draft);
    changed.sourceRevisions.push({
      bindingDigest: SOURCE_ARTIFACTS.calendar.bindingDigest,
      sourceIdentityDigest:
        SOURCE_ARTIFACTS.calendar.sourceIdentityDigest,
      sourceRevisionDigest:
        SOURCE_ARTIFACTS.calendar.currentRevisionDigest,
      contentDigest: SOURCE_ARTIFACTS.calendar.currentContentDigest,
    });
    changed.sourceRevisionSets = revisionSetsFor(
      changed.sourceRevisions,
      changed.sourceBindings.map((binding) => binding.bindingDigest),
    );
    const changedPlan = buildTaskMapRefreshPlan(changed);
    assert.strictEqual(changedPlan.isExactNoOp, false);
    assert.ok(
      changedPlan.refreshReasonCodes.includes("source_revision_changed"),
    );
    assert.ok(
      !changedPlan.refreshReasonCodes.includes(
        "semantic_implementation_changed",
      ),
    );
    assert.notStrictEqual(
      changedPlan.candidateAcceptedStateDigest,
      first.candidateAcceptedStateDigest,
    );
  });

  it("rejects missing, duplicate, forged, or unknown revision-set evidence", () => {
    const missing = canonicalDraft();
    missing.sourceRevisionSets.pop();
    assert.throws(
      () => buildTaskMapRefreshPlan(missing),
      /canonical digest for every declared binding|missing evidence/i,
    );

    const duplicate = canonicalDraft();
    duplicate.sourceRevisionSets.push(
      structuredClone(duplicate.sourceRevisionSets[0]),
    );
    assert.throws(
      () => buildTaskMapRefreshPlan(duplicate),
      /revision sets contains a duplicate binding/i,
    );

    const forged = canonicalDraft();
    forged.sourceRevisionSets[0].revisionSetDigest =
      digest("forged-revision-set");
    assert.throws(
      () => buildTaskMapRefreshPlan(forged),
      /does not match.*canonical sorted revision triples/i,
    );

    const unknown = canonicalDraft() as unknown as JsonRecord;
    ((unknown.sourceRevisionSets as JsonRecord[])[0]).rowCount = 1;
    assert.throws(
      () => buildTaskMapRefreshPlan(
        unknown as unknown as TaskMapRefreshPlanDraftV1,
      ),
      /unknown|field/i,
    );
  });

  it("treats a removed active binding as a deterministic source/topology change", () => {
    const draft = exactNoOpDraft();
    draft.sourceBindings = draft.sourceBindings.filter(
      (binding) => (
        binding.bindingDigest !== SOURCE_ARTIFACTS.granola.bindingDigest
      ),
    );
    draft.sourceRevisions = draft.sourceRevisions.filter(
      (revision) => (
        revision.bindingDigest !== SOURCE_ARTIFACTS.granola.bindingDigest
      ),
    );
    draft.sourceRevisionSets = draft.sourceRevisionSets.filter(
      (revisionSet) => (
        revisionSet.bindingDigest !== SOURCE_ARTIFACTS.granola.bindingDigest
      ),
    );
    draft.lanes = draft.lanes.filter((plannedLane) => (
      plannedLane.laneId !== LANE_IDS.collectGranola
      && plannedLane.laneId !== LANE_IDS.normalizeGranola
    ));
    laneById(
      draft,
      LANE_IDS.identityBarrier,
    ).predecessorLaneIds = [LANE_IDS.normalizeCalendar];

    const plan = buildTaskMapRefreshPlan(draft);
    assert.strictEqual(plan.isExactNoOp, false);
    assert.ok(plan.refreshReasonCodes.includes("source_revision_changed"));
    assert.ok(
      plan.refreshReasonCodes.includes("semantic_implementation_changed"),
    );
    assert.ok(
      plan.baseline.priorProviderArtifacts.some(
        (artifact) => (
          artifact.bindingDigest === SOURCE_ARTIFACTS.granola.bindingDigest
        ),
      ),
    );
    assert.ok(
      !plan.sourceBindings.some(
        (binding) => (
          binding.bindingDigest === SOURCE_ARTIFACTS.granola.bindingDigest
        ),
      ),
    );
  });

  it("treats a binding rotation as a source/topology change without reusing the retired artifact", () => {
    const draft = exactNoOpDraft();
    const rotatedBindingDigest = digest("binding-granola-rotated");
    const rotatedBinding = draft.sourceBindings.find(
      (binding) => (
        binding.bindingDigest === SOURCE_ARTIFACTS.granola.bindingDigest
      ),
    )!;
    rotatedBinding.bindingDigest = rotatedBindingDigest;
    for (const revision of draft.sourceRevisions) {
      if (
        revision.bindingDigest === SOURCE_ARTIFACTS.granola.bindingDigest
      ) {
        revision.bindingDigest = rotatedBindingDigest;
      }
    }
    draft.sourceRevisionSets = revisionSetsFor(
      draft.sourceRevisions,
      draft.sourceBindings.map((binding) => binding.bindingDigest),
    );
    for (const laneId of [
      LANE_IDS.collectGranola,
      LANE_IDS.normalizeGranola,
    ]) {
      laneById(draft, laneId).inputDigests = [rotatedBindingDigest];
    }

    const plan = buildTaskMapRefreshPlan(draft);
    assert.strictEqual(plan.isExactNoOp, false);
    assert.ok(plan.refreshReasonCodes.includes("source_revision_changed"));
    assert.ok(
      plan.refreshReasonCodes.includes("semantic_implementation_changed"),
    );
    for (const laneId of [
      LANE_IDS.collectGranola,
      LANE_IDS.normalizeGranola,
    ]) {
      assert.deepStrictEqual(
        planLaneById(plan, laneId).inputDigests,
        [rotatedBindingDigest],
      );
    }
    assert.ok(
      plan.baseline.priorProviderArtifacts.some(
        (artifact) => (
          artifact.bindingDigest === SOURCE_ARTIFACTS.granola.bindingDigest
        ),
      ),
    );
  });

  it("rejects unpaired bindings in the prior accepted binding manifest", () => {
    const unpairedSet = canonicalDraft();
    unpairedSet.baseline.acceptedSourceRevisionSets.push({
      bindingDigest: digest("retired-unpaired-set"),
      revisionSetDigest: taskMapContractDigest([]),
    });
    assert.throws(
      () => buildTaskMapRefreshPlan(unpairedSet),
      /accepted source revision sets references an undeclared source binding/i,
    );

    const unpairedArtifact = canonicalDraft();
    const retiredBindingDigest = digest("retired-unpaired-artifact");
    const retiredCheckpointDigest = digest("retired-checkpoint");
    const retiredSourceSliceDigest = digest("retired-source-slice");
    unpairedArtifact.baseline.priorProviderArtifacts.push({
      bindingDigest: retiredBindingDigest,
      checkpointDigest: retiredCheckpointDigest,
      sourceSliceDigest: retiredSourceSliceDigest,
    });
    unpairedArtifact.baseline.priorCheckpointDigests.push(
      retiredCheckpointDigest,
    );
    unpairedArtifact.baseline.priorSourceSliceDigests.push(
      retiredSourceSliceDigest,
    );
    assert.throws(
      () => buildTaskMapRefreshPlan(unpairedArtifact),
      /accepted source revision sets requires one canonical digest for every declared binding/i,
    );
  });

  it("rejects an accepted baseline from a different owner scope", () => {
    const crossOwner = canonicalDraft();
    crossOwner.baseline.priorOwnerScopeDigest =
      digest("different-owner-scope");
    assert.throws(
      () => buildTaskMapRefreshPlan(crossOwner),
      /cannot cross owner scope|owner.*baseline/i,
    );
  });

  it("rejects external mutation without an explicit approval gate", () => {
    const draft = canonicalDraft();
    const publication = laneById(draft, LANE_IDS.publication);
    publication.effect = "external_mutation";
    delete publication.approvalGateId;
    assert.throws(
      () => buildTaskMapRefreshPlan(draft),
      /approval.*gate|ungated.*mutation/i,
    );
  });

  it("rejects source-shaped identity namespaces in registry-owned fields", () => {
    const mutations: Array<(draft: TaskMapRefreshPlanDraftV1) => void> = [
      (draft) => {
        laneById(draft, LANE_IDS.collectCalendar).laneId =
          "participant:alice-smith";
      },
      (draft) => {
        laneById(draft, LANE_IDS.collectCalendar).operationVersion =
          "contact:alice-smith";
      },
      (draft) => {
        laneById(
          draft,
          LANE_IDS.collectCalendar,
        ).resourceClaims[0].resourceId = "phone:14155551212";
      },
      (draft) => {
        laneById(draft, LANE_IDS.publication).approvalGateId =
          "participant:alice-smith";
      },
      (draft) => {
        draft.sourceBindings[0].adapterVersion =
          "contact:alice-smith";
      },
      (draft) => {
        draft.policyBindings[0].version = "phone:14155551212";
      },
      (draft) => {
        laneById(draft, LANE_IDS.collectCalendar).laneId =
          "user:alice-smith";
      },
      (draft) => {
        laneById(draft, LANE_IDS.collectCalendar).operationVersion =
          "guest:alice-smith";
      },
      (draft) => {
        laneById(
          draft,
          LANE_IDS.collectCalendar,
        ).resourceClaims[0].resourceId = "member:alice-smith";
      },
    ];
    for (const mutate of mutations) {
      const draft = canonicalDraft();
      mutate(draft);
      assert.throws(
        () => buildTaskMapRefreshPlan(draft),
        /bounded ASCII opaque identifier|private|unsafe/i,
      );
    }
  });

  it("rejects an optional external mutation laundered into required ancestry", () => {
    const draft = canonicalDraft();
    draft.lanes.push(lane({
      laneId: "optional-external-predecessor",
      goal: "refresh_audit",
      operationVersion: "optional-external-predecessor.1",
      priority: "P2",
      priorityReasonCodes: ["optional_audit"],
      predecessorLaneIds: [LANE_IDS.identityBarrier],
      resourceClaims: [{
        resourceId: "optional:external-predecessor",
        mode: "exclusive",
      }],
      effect: "external_mutation",
      approvalGateId: "syntactic-only-gate",
      requiredForPublication: false,
      inputDigests: [digest("optional-external-predecessor")],
      outputKinds: ["refresh_audit"],
    }));
    laneById(draft, LANE_IDS.projection).predecessorLaneIds.push(
      "optional-external-predecessor",
    );
    assert.throws(
      () => buildTaskMapRefreshPlan(draft),
      /required.*cannot depend on optional ancestors|optional ancestor/i,
    );
  });

  it("accepts only closed operation goals and rejects private prose", () => {
    assert.doesNotThrow(() => buildTaskMapRefreshPlan(canonicalDraft()));
    const privateGoal = canonicalDraft() as unknown as JsonRecord;
    (privateGoal.lanes as JsonRecord[])[0].goal =
      "review a private participant conversation";
    assert.throws(
      () => buildTaskMapRefreshPlan(
        privateGoal as unknown as TaskMapRefreshPlanDraftV1,
      ),
      /closed operation code|goal/i,
    );
  });

  it("rejects raw/private fields, paths, secrets, task roots, routes, and readiness", () => {
    const unknownFieldCases: Array<[string, (draft: JsonRecord) => void]> = [
      ["top-level privacy", (draft) => {
        draft.privacy = { rawBodiesStored: true };
      }],
      ["raw body", (draft) => {
        (draft.lanes as JsonRecord[])[0].rawTranscript = "private body";
      }],
      ["task root", (draft) => {
        (draft.lanes as JsonRecord[])[0].taskRootId = "task-root";
      }],
      ["route", (draft) => {
        (draft.lanes as JsonRecord[])[0].sourceRoute = "writeback";
      }],
      ["readiness", (draft) => {
        (draft.lanes as JsonRecord[])[0].routeReadiness = "ready";
      }],
      ["binding detail", (draft) => {
        (draft.sourceBindings as JsonRecord[])[0].connectionId =
          "raw-connection-id";
      }],
    ];
    for (const [label, mutate] of unknownFieldCases) {
      assert.doesNotThrow(() => label);
      expectDraftRejection(mutate, /unknown|unsupported|forbidden|field/i);
    }

    expectDraftRejection((draft) => {
      (draft.lanes as JsonRecord[])[0].operationVersion =
        "/Users/private/taskmap-adapter";
    }, /path|safe|operationVersion|private/i);
    expectDraftRejection((draft) => {
      (draft.lanes as JsonRecord[])[0].operationVersion =
        "sk-proj-abcdefghijklmnopqrstuv";
    }, /secret|safe|operationVersion|private/i);
  });

  it("recursively rejects encoded paths, credential URIs, secrets, and execution semantics", () => {
    const privateCorpus = [
      "/Users/neo/private/taskmap",
      "~/Library/Application Support/owner",
      "../owner/private-artifact",
      "C:\\Users\\neo\\private",
      "\\\\server\\share\\owner",
      "file:///Users/neo/private",
      "s3://private-owner-bucket/source",
      "owner%2Fprivate%2Fartifact",
      "file%3A%2F%2FUsers%2Fneo",
      "https://neo:secret@example.com/private",
      "postgres://neo:secret@localhost/taskmap",
      "https%3A%2F%2Fneo:secret@internal",
      "owner@example.com",
      "ghp_abcdefghijklmnopqrstuvwxyz123456",
      ["xo", "xb-1234567890-abcdefghijklmnop"].join(""),
      "npm_abcdefghijklmnopqrstuvwxyz123456",
      "sk-proj-abcdefghijklmnopqrstuv",
      "bearer abcdefghijklmnop",
      "-----BEGIN PRIVATE KEY-----",
      "eyJhbGciOiJIUzI1NiJ9.eyJvd25lciI6InByaXZhdGUifQ.signature123",
      "task root readiness",
      "approve & run dispatch",
    ];
    const injectors: Array<(draft: JsonRecord, value: string) => void> = [
      (draft, value) => {
        (draft.lanes as JsonRecord[])[0].goal = value;
      },
      (draft, value) => {
        (draft.policyBindings as JsonRecord[])[0].version = value;
      },
      (draft, value) => {
        (draft.sourceBindings as JsonRecord[])[0].adapterVersion = value;
      },
      (draft, value) => {
        (((draft.lanes as JsonRecord[])[0].resourceClaims as JsonRecord[])[0])
          .resourceId = value;
      },
    ];
    for (let index = 0; index < privateCorpus.length; index += 1) {
      const value = privateCorpus[index];
      expectDraftRejection(
        (draft) => injectors[index % injectors.length](draft, value),
        /private, unsafe, or task-execution text|bounded ASCII opaque identifier|closed operation code/i,
      );
    }
  });

  it("rejects unknown fields at every nested boundary and closes all enums", () => {
    const unknownNestedCases: Array<(draft: JsonRecord) => void> = [
      (draft) => {
        (draft.baseline as JsonRecord).unexpected = true;
      },
      (draft) => {
        (draft.reviewedDigests as JsonRecord).unexpected = true;
      },
      (draft) => {
        (draft.sourceBindings as JsonRecord[])[0].unexpected = true;
      },
      (draft) => {
        (draft.sourceRevisions as JsonRecord[])[0].unexpected = true;
      },
      (draft) => {
        (draft.sourceRevisionSets as JsonRecord[])[0].unexpected = true;
      },
      (draft) => {
        (
          ((draft.baseline as JsonRecord)
            .acceptedSourceRevisionSets as JsonRecord[])
        )[0].unexpected = true;
      },
      (draft) => {
        (draft.policyBindings as JsonRecord[])[0].unexpected = true;
      },
      (draft) => {
        (draft.lanes as JsonRecord[])[0].unexpected = true;
      },
      (draft) => {
        (((draft.lanes as JsonRecord[])[0].resourceClaims as JsonRecord[])[0])
          .unexpected = true;
      },
    ];
    for (const mutate of unknownNestedCases) {
      expectDraftRejection(mutate, /unknown|unsupported|field/i);
    }

    const invalidEnumCases: Array<(draft: JsonRecord) => void> = [
      (draft) => {
        (draft.baseline as JsonRecord).kind = "rolling";
      },
      (draft) => {
        (draft.lanes as JsonRecord[])[0].priority = "P3";
      },
      (draft) => {
        (draft.lanes as JsonRecord[])[0].effect = "network_write";
      },
      (draft) => {
        (((draft.lanes as JsonRecord[])[0].resourceClaims as JsonRecord[])[0])
          .mode = "append";
      },
      (draft) => {
        (draft.lanes as JsonRecord[])[0].priorityReasonCodes =
          ["because_the_caller_said_so"];
      },
      (draft) => {
        (draft.lanes as JsonRecord[])[0].outputKinds = ["raw_provider_body"];
      },
    ];
    for (const mutate of invalidEnumCases) {
      expectDraftRejection(
        mutate,
        /unsupported|invalid|priority|effect|mode|reason|output|baseline/i,
      );
    }
  });

  it("rejects watermark-only and fixed-time orchestration inputs", () => {
    expectDraftRejection((draft) => {
      draft.fixedNow = "2026-07-28T00:00:00.000Z";
    }, /fixedNow|unknown|time/i);
    expectDraftRejection((draft) => {
      (draft.baseline as JsonRecord).watermarkDigest =
        digest("watermark-only");
    }, /watermark|unknown/i);
    expectDraftRejection((draft) => {
      (draft.sourceBindings as JsonRecord[])[0].watermark =
        digest("provider-watermark");
    }, /watermark|unknown/i);
  });

  it("changes planId for policy, resource-claim, or predecessor changes", () => {
    const base = buildTaskMapRefreshPlan(canonicalDraft());

    const policyChanged = canonicalDraft();
    policyChanged.policyBindings[0].version = "identity-policy.2";
    policyChanged.policyBindings[0].digest = digest("policy-identity-v2");

    const claimChanged = canonicalDraft();
    laneById(claimChanged, LANE_IDS.collectCalendar)
      .resourceClaims[0].resourceId = "provider:google_calendar:v2";

    const predecessorChanged = canonicalDraft();
    laneById(predecessorChanged, LANE_IDS.lifecycleGate)
      .predecessorLaneIds.push(LANE_IDS.authorityGate);

    assert.notStrictEqual(
      buildTaskMapRefreshPlan(policyChanged).planId,
      base.planId,
    );
    assert.notStrictEqual(
      buildTaskMapRefreshPlan(claimChanged).planId,
      base.planId,
    );
    assert.notStrictEqual(
      buildTaskMapRefreshPlan(predecessorChanged).planId,
      base.planId,
    );
  });

  it("rejects extra or changed provider inputs even on an exact no-op draft", () => {
    const extra = exactNoOpDraft();
    laneById(extra, LANE_IDS.collectCalendar).inputDigests.push(
      digest("arbitrary-provider-extra"),
    );
    assert.throws(
      () => buildTaskMapRefreshPlan(extra),
      /provider lane input digests.*derived|prior artifacts/i,
    );

    const changed = exactNoOpDraft();
    const calendarCollect = laneById(
      changed,
      LANE_IDS.collectCalendar,
    );
    calendarCollect.inputDigests = calendarCollect.inputDigests.map(
      (inputDigest) => (
        inputDigest === SOURCE_ARTIFACTS.calendar.priorCheckpointDigest
          ? digest("forged-provider-checkpoint-input")
          : inputDigest
      ),
    );
    assert.throws(
      () => buildTaskMapRefreshPlan(changed),
      /provider lane input digests.*derived|prior artifacts/i,
    );
  });

  it("separates policy/content identity from scheduling-only plan identity", () => {
    const baseDraft = exactNoOpDraft();
    const base = buildTaskMapRefreshPlan(baseDraft);
    assert.strictEqual(base.isExactNoOp, true);

    const policyChanged = exactNoOpDraft();
    const identityPolicy = policyChanged.policyBindings.find(
      (policy) => policy.name === "identity-policy",
    )!;
    identityPolicy.version = "identity-policy.2";
    identityPolicy.digest = digest("policy-identity-v2");
    const policyPlan = buildTaskMapRefreshPlan(policyChanged);
    assert.strictEqual(policyPlan.isExactNoOp, false);
    assert.ok(policyPlan.refreshReasonCodes.includes("policy_bundle_changed"));
    assert.notStrictEqual(
      policyPlan.candidateAcceptedStateDigest,
      base.candidateAcceptedStateDigest,
    );

    const adapterChanged = exactNoOpDraft();
    adapterChanged.sourceBindings[0].adapterVersion =
      "google-calendar-adapter.2";
    const adapterPlan = buildTaskMapRefreshPlan(adapterChanged);
    assert.strictEqual(adapterPlan.isExactNoOp, false);
    assert.ok(
      adapterPlan.refreshReasonCodes.includes(
        "semantic_implementation_changed",
      ),
    );
    assert.notStrictEqual(
      adapterPlan.candidateAcceptedStateDigest,
      base.candidateAcceptedStateDigest,
    );

    const bindingRolesChanged = exactNoOpDraft();
    const calendarCollectInputs = [
      ...laneById(
        bindingRolesChanged,
        LANE_IDS.collectCalendar,
      ).inputDigests,
    ];
    laneById(
      bindingRolesChanged,
      LANE_IDS.collectCalendar,
    ).inputDigests = [
      ...laneById(
        bindingRolesChanged,
        LANE_IDS.collectGranola,
      ).inputDigests,
    ];
    laneById(
      bindingRolesChanged,
      LANE_IDS.collectGranola,
    ).inputDigests = calendarCollectInputs;
    const calendarNormalizeInputs = [
      ...laneById(
        bindingRolesChanged,
        LANE_IDS.normalizeCalendar,
      ).inputDigests,
    ];
    laneById(
      bindingRolesChanged,
      LANE_IDS.normalizeCalendar,
    ).inputDigests = [
      ...laneById(
        bindingRolesChanged,
        LANE_IDS.normalizeGranola,
      ).inputDigests,
    ];
    laneById(
      bindingRolesChanged,
      LANE_IDS.normalizeGranola,
    ).inputDigests = calendarNormalizeInputs;
    const bindingRolesPlan = buildTaskMapRefreshPlan(bindingRolesChanged);
    assert.strictEqual(bindingRolesPlan.isExactNoOp, false);
    assert.notStrictEqual(
      bindingRolesPlan.candidateAcceptedStateDigest,
      base.candidateAcceptedStateDigest,
    );

    const operationChanged = exactNoOpDraft();
    laneById(operationChanged, LANE_IDS.projection).operationVersion =
      "taskmap-projection.2";
    const operationPlan = buildTaskMapRefreshPlan(operationChanged);
    assert.strictEqual(operationPlan.isExactNoOp, false);
    assert.notStrictEqual(
      operationPlan.candidateAcceptedStateDigest,
      base.candidateAcceptedStateDigest,
    );

    const reviewedRolesChanged = exactNoOpDraft();
    const authorityInputs = [
      ...laneById(reviewedRolesChanged, LANE_IDS.authorityGate).inputDigests,
    ];
    laneById(reviewedRolesChanged, LANE_IDS.authorityGate).inputDigests = [
      ...laneById(reviewedRolesChanged, LANE_IDS.lifecycleGate).inputDigests,
    ];
    laneById(reviewedRolesChanged, LANE_IDS.lifecycleGate).inputDigests =
      authorityInputs;
    const reviewedRolesPlan = buildTaskMapRefreshPlan(reviewedRolesChanged);
    assert.strictEqual(reviewedRolesPlan.isExactNoOp, false);
    assert.notStrictEqual(
      reviewedRolesPlan.candidateAcceptedStateDigest,
      base.candidateAcceptedStateDigest,
    );

    const priorityBaseDraft = exactNoOpDraft();
    priorityBaseDraft.lanes.push(lane({
      laneId: "optional-scheduling-hint",
      goal: "refresh_audit",
      operationVersion: "optional-scheduling-hint.1",
      priority: "P1",
      priorityReasonCodes: ["optional_enrichment"],
      predecessorLaneIds: [LANE_IDS.projection],
      resourceClaims: [{
        resourceId: "optional:scheduling-hint",
        mode: "shared",
      }],
      effect: "read_only",
      requiredForPublication: false,
      inputDigests: [digest("optional-scheduling-hint")],
      outputKinds: ["refresh_audit"],
    }));
    const priorityBase = buildTaskMapRefreshPlan(priorityBaseDraft);
    const priorityChanged = structuredClone(priorityBaseDraft);
    const priorityLane = laneById(
      priorityChanged,
      "optional-scheduling-hint",
    );
    priorityLane.priority = "P2";
    priorityLane.priorityReasonCodes = ["optional_audit"];
    const priorityPlan = buildTaskMapRefreshPlan(priorityChanged);
    assert.notStrictEqual(priorityPlan.planId, priorityBase.planId);
    assert.strictEqual(
      priorityPlan.candidateAcceptedStateDigest,
      priorityBase.candidateAcceptedStateDigest,
    );

    const claimChanged = exactNoOpDraft();
    laneById(claimChanged, LANE_IDS.authorityGate)
      .resourceClaims[0].resourceId = "taskmap:deterministic-gates:v2";
    const claimPlan = buildTaskMapRefreshPlan(claimChanged);
    assert.notStrictEqual(claimPlan.planId, base.planId);
    assert.strictEqual(
      claimPlan.candidateAcceptedStateDigest,
      base.candidateAcceptedStateDigest,
    );
  });
});

describe("Task Map refresh ready-batch selection", () => {
  it("preflights a near-limit plan and max-size selection in separate domains", () => {
    const plan = buildTaskMapRefreshPlan(
      largeSelectablePlanDraft(3_500),
    );
    const selection = {
      maxConcurrency: TASKMAP_REFRESH_PLAN_LIMITS_V1.maxConcurrency,
      laneStates: laneStates(plan),
    };
    const planBytes = Buffer.byteLength(
      taskMapContractCanonicalJson(plan),
      "utf8",
    );
    const selectionBytes = Buffer.byteLength(
      taskMapContractCanonicalJson(selection),
      "utf8",
    );
    assert.strictEqual(
      selection.laneStates.length,
      TASKMAP_REFRESH_PLAN_LIMITS_V1.maxLanes,
    );
    assert.ok(
      planBytes <= TASKMAP_REFRESH_PLAN_LIMITS_V1.maxCanonicalPlanBytes,
    );
    assert.ok(
      planBytes + selectionBytes
      > TASKMAP_REFRESH_PLAN_LIMITS_V1.maxCanonicalPlanBytes,
      `expected separate valid domains to exceed a combined ceiling; `
      + `plan=${planBytes}, selection=${selectionBytes}`,
    );
    const batch = selectTaskMapReadyBatch(plan, selection);
    assert.ok(
      batch.selectedLaneIds.length
      <= TASKMAP_REFRESH_PLAN_LIMITS_V1.maxConcurrency,
    );
  });

  it("descriptor-first preflights selection and lane states before reads", () => {
    const plan = buildTaskMapRefreshPlan(canonicalDraft());

    const wideUnknown = {
      maxConcurrency: 2,
      laneStates: laneStates(plan),
      unexpectedWide: Object.fromEntries(
        Array.from(
          {
            length:
              TASKMAP_REFRESH_PLAN_LIMITS_V1.maxRawObjectKeys + 1,
          },
          (_, index) => [`unknown${index}`, 0],
        ),
      ),
    } as unknown as JsonRecord;
    assert.throws(
      () => selectTaskMapReadyBatch(
        plan,
        wideUnknown as unknown as Parameters<
          typeof selectTaskMapReadyBatch
        >[1],
      ),
      /object exceeds 64 keys/i,
    );

    const wideStates = {
      maxConcurrency: 2,
      laneStates: Array.from(
        {
          length: TASKMAP_REFRESH_PLAN_LIMITS_V1.maxLanes + 1,
        },
        (_, index) => ({
          laneId: `wide-state-${index}`,
          status: "pending",
        }),
      ),
    };
    assert.throws(
      () => selectTaskMapReadyBatch(
        plan,
        wideStates as unknown as Parameters<
          typeof selectTaskMapReadyBatch
        >[1],
      ),
      /laneStates must be a bounded array|laneStates.*1024/i,
    );

    const hugeScalar = {
      maxConcurrency: "x".repeat(
        TASKMAP_REFRESH_PLAN_LIMITS_V1.maxRawStringBytes + 1,
      ),
      laneStates: laneStates(plan),
    };
    assert.throws(
      () => selectTaskMapReadyBatch(
        plan,
        hugeScalar as unknown as Parameters<
          typeof selectTaskMapReadyBatch
        >[1],
      ),
      /raw string exceeds 4096 bytes/i,
    );

    const nestedSelection = {
      maxConcurrency: 2,
      laneStates: laneStates(plan),
    } as unknown as JsonRecord;
    let nestedValue: unknown = 0;
    for (
      let depth = 0;
      depth < TASKMAP_REFRESH_PLAN_LIMITS_V1.maxRawNestingDepth + 2;
      depth += 1
    ) {
      nestedValue = [nestedValue];
    }
    nestedSelection.unexpectedNested = nestedValue;
    assert.throws(
      () => selectTaskMapReadyBatch(
        plan,
        nestedSelection as unknown as Parameters<
          typeof selectTaskMapReadyBatch
        >[1],
      ),
      /raw nesting depth 64/i,
    );

    const topLevelAccessor = {
      maxConcurrency: 2,
      laneStates: laneStates(plan),
    };
    const originalStates = topLevelAccessor.laneStates;
    let topLevelReads = 0;
    Object.defineProperty(topLevelAccessor, "laneStates", {
      enumerable: true,
      configurable: true,
      get: () => {
        topLevelReads += 1;
        return originalStates;
      },
    });
    assert.throws(
      () => selectTaskMapReadyBatch(
        plan,
        topLevelAccessor,
      ),
      /accessor-backed values/i,
    );
    assert.strictEqual(topLevelReads, 0);

    const concurrencyAccessor = {
      maxConcurrency: 2,
      laneStates: laneStates(plan),
    };
    let concurrencyReads = 0;
    Object.defineProperty(concurrencyAccessor, "maxConcurrency", {
      enumerable: true,
      configurable: true,
      get: () => {
        concurrencyReads += 1;
        return concurrencyReads === 1 ? 1 : 1_000;
      },
    });
    assert.throws(
      () => selectTaskMapReadyBatch(
        plan,
        concurrencyAccessor,
      ),
      /accessor-backed values/i,
    );
    assert.strictEqual(concurrencyReads, 0);

    const selectionTarget = {
      maxConcurrency: 2,
      laneStates: laneStates(plan),
    };
    let selectionProxyReads = 0;
    const proxiedSelection = new Proxy(selectionTarget, {
      get: (target, property, receiver) => {
        selectionProxyReads += 1;
        if (property === "maxConcurrency") {
          return selectionProxyReads === 1 ? 1 : 1_000;
        }
        if (property === "laneStates") {
          return selectionProxyReads === 1 ? target.laneStates : [];
        }
        return Reflect.get(target, property, receiver);
      },
    });
    assert.throws(
      () => selectTaskMapReadyBatch(plan, proxiedSelection),
      /cannot be snapshotted as plain JSON data/i,
    );
    assert.strictEqual(selectionProxyReads, 0);

    const laneStateTarget = laneStates(plan);
    let laneStatesProxyReads = 0;
    const proxiedLaneStates = new Proxy(laneStateTarget, {
      get: (target, property, receiver) => {
        laneStatesProxyReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    assert.throws(
      () => selectTaskMapReadyBatch(plan, {
        maxConcurrency: 2,
        laneStates: proxiedLaneStates,
      }),
      /cannot be snapshotted as plain JSON data/i,
    );
    assert.strictEqual(laneStatesProxyReads, 0);

    const stateAccessor = {
      maxConcurrency: 2,
      laneStates: laneStates(plan),
    };
    const firstState =
      stateAccessor.laneStates[0] as unknown as JsonRecord;
    const originalStatus = firstState.status;
    let stateReads = 0;
    Object.defineProperty(firstState, "status", {
      enumerable: true,
      configurable: true,
      get: () => {
        stateReads += 1;
        return originalStatus;
      },
    });
    assert.throws(
      () => selectTaskMapReadyBatch(plan, stateAccessor),
      /accessor-backed values/i,
    );
    assert.strictEqual(stateReads, 0);

    const wideState = {
      maxConcurrency: 2,
      laneStates: laneStates(plan),
    };
    Object.assign(
      wideState.laneStates[0],
      Object.fromEntries(
        Array.from(
          {
            length:
              TASKMAP_REFRESH_PLAN_LIMITS_V1.maxRawObjectKeys + 1,
          },
          (_, index) => [`unknown${index}`, 0],
        ),
      ),
    );
    assert.throws(
      () => selectTaskMapReadyBatch(plan, wideState),
      /object exceeds 64 keys/i,
    );

    const symbolState = {
      maxConcurrency: 2,
      laneStates: laneStates(plan),
    };
    let symbolReads = 0;
    Object.defineProperty(
      symbolState.laneStates[0],
      Symbol("forged-state"),
      {
        enumerable: false,
        configurable: true,
        get: () => {
          symbolReads += 1;
          return true;
        },
      },
    );
    assert.throws(
      () => selectTaskMapReadyBatch(plan, symbolState),
      /symbol-keyed values/i,
    );
    assert.strictEqual(symbolReads, 0);

    const hiddenState = {
      maxConcurrency: 2,
      laneStates: laneStates(plan),
    };
    Object.defineProperty(
      hiddenState.laneStates[0],
      "hiddenState",
      {
        enumerable: false,
        configurable: true,
        value: true,
      },
    );
    assert.throws(
      () => selectTaskMapReadyBatch(plan, hiddenState),
      /hidden properties/i,
    );

    const sparseStates = {
      maxConcurrency: 2,
      laneStates: new Array(1),
    };
    assert.throws(
      () => selectTaskMapReadyBatch(
        plan,
        sparseStates as unknown as Parameters<
          typeof selectTaskMapReadyBatch
        >[1],
      ),
      /holes or hidden elements/i,
    );

    const cyclicSelection = {
      maxConcurrency: 2,
      laneStates: laneStates(plan),
    } as unknown as JsonRecord;
    cyclicSelection.unexpectedCycle = cyclicSelection;
    assert.throws(
      () => selectTaskMapReadyBatch(
        plan,
        cyclicSelection as unknown as Parameters<
          typeof selectTaskMapReadyBatch
        >[1],
      ),
      /cyclic values/i,
    );
  });

  it("orders runnable work by P0, then P1/P2, with a stable lane-id tie break", () => {
    const draft = canonicalDraft();
    draft.lanes.push(
      lane({
        laneId: "optional-p1-audit",
        goal: "refresh_audit",
        operationVersion: "audit.1",
        priority: "P1",
        priorityReasonCodes: ["optional_enrichment"],
        predecessorLaneIds: [],
        resourceClaims: [{
          resourceId: "taskmap:optional-audit",
          mode: "shared",
        }],
        effect: "read_only",
        requiredForPublication: false,
        inputDigests: [digest("optional-audit")],
        outputKinds: ["refresh_audit"],
      }),
      lane({
        laneId: "optional-p2-strategy",
        goal: "strategy_projection",
        operationVersion: "strategy.1",
        priority: "P2",
        priorityReasonCodes: ["optional_automation"],
        predecessorLaneIds: [
          LANE_IDS.authorityGate,
          LANE_IDS.lifecycleGate,
        ],
        resourceClaims: [{
          resourceId: "taskmap:optional-strategy",
          mode: "shared",
        }],
        effect: "read_only",
        requiredForPublication: false,
        inputDigests: [digest("optional-strategy")],
        outputKinds: ["strategy_projection"],
      }),
    );
    const plan = buildTaskMapRefreshPlan(draft);
    const batch = selectTaskMapReadyBatch(plan, {
      maxConcurrency: 1,
      laneStates: laneStates(plan),
    });
    assert.deepStrictEqual(
      batch.selectedLaneIds,
      [LANE_IDS.collectCalendar],
    );
  });

  it("never schedules an external mutation from a syntactically valid fake gate", () => {
    const draft = canonicalDraft();
    const publication = laneById(draft, LANE_IDS.publication);
    publication.effect = "external_mutation";
    publication.approvalGateId = "fake-receipt-gate";
    const plan = buildTaskMapRefreshPlan(draft);
    const batch = selectTaskMapReadyBatch(plan, {
      maxConcurrency: 1,
      laneStates: laneStates(plan, {
        ...stateOverridesThroughBarrier(),
        [LANE_IDS.authorityGate]: { status: "succeeded" },
        [LANE_IDS.lifecycleGate]: { status: "succeeded" },
        [LANE_IDS.projection]: { status: "succeeded" },
      }),
    });
    assert.strictEqual(batch.publication.eligible, false);
    assert.strictEqual(batch.publication.state, "blocked");
    assert.ok(
      batch.publication.reasonCodes.includes(
        "approval_authority_unavailable",
      ),
    );
    assert.deepStrictEqual(batch.selectedLaneIds, []);
    assert.throws(
      () => selectTaskMapReadyBatch(plan, {
        maxConcurrency: 1,
        laneStates: laneStates(plan, {
          ...stateOverridesThroughBarrier(),
          [LANE_IDS.authorityGate]: { status: "succeeded" },
          [LANE_IDS.lifecycleGate]: { status: "succeeded" },
          [LANE_IDS.projection]: { status: "succeeded" },
          [LANE_IDS.publication]: { status: "succeeded" },
        }),
      }),
      /external mutation history.*receipt authority/i,
    );
  });

  it("selects both independent provider reads in parallel", () => {
    const plan = buildTaskMapRefreshPlan(canonicalDraft());
    const batch = selectTaskMapReadyBatch(plan, {
      maxConcurrency: 2,
      laneStates: laneStates(plan),
    });
    assert.deepStrictEqual(
      batch.selectedLaneIds,
      [LANE_IDS.collectCalendar, LANE_IDS.collectGranola],
    );
    assert.strictEqual(publicationState(batch), "waiting");
  });

  it("allows shared/shared claims and serializes an exclusive claimant", () => {
    const sharedDraft = canonicalDraft();
    for (const laneId of [
      LANE_IDS.collectCalendar,
      LANE_IDS.collectGranola,
    ]) {
      laneById(sharedDraft, laneId).resourceClaims = [{
        resourceId: "provider:shared-read-pool",
        mode: "shared",
      }];
    }
    const sharedPlan = buildTaskMapRefreshPlan(sharedDraft);
    const shared = selectTaskMapReadyBatch(sharedPlan, {
      maxConcurrency: 2,
      laneStates: laneStates(sharedPlan),
    });
    assert.deepStrictEqual(
      shared.selectedLaneIds,
      [LANE_IDS.collectCalendar, LANE_IDS.collectGranola],
    );

    const exclusiveDraft = structuredClone(sharedDraft);
    laneById(exclusiveDraft, LANE_IDS.collectGranola)
      .resourceClaims[0].mode = "exclusive";
    const exclusivePlan = buildTaskMapRefreshPlan(exclusiveDraft);
    const exclusive = selectTaskMapReadyBatch(exclusivePlan, {
      maxConcurrency: 2,
      laneStates: laneStates(exclusivePlan),
    });
    assert.deepStrictEqual(
      exclusive.selectedLaneIds,
      [LANE_IDS.collectCalendar],
    );
  });

  it("skips a claim-blocked P0 and fills capacity with independent P1/P2 work", () => {
    const draft = canonicalDraft();
    laneById(draft, LANE_IDS.collectCalendar).resourceClaims = [{
      resourceId: "provider:blocked-pool",
      mode: "shared",
    }];
    laneById(draft, LANE_IDS.collectGranola).resourceClaims = [{
      resourceId: "provider:blocked-pool",
      mode: "exclusive",
    }];
    draft.lanes.push(
      lane({
        laneId: "optional-independent-p1",
        goal: "refresh_audit",
        operationVersion: "optional-independent-p1.1",
        priority: "P1",
        priorityReasonCodes: ["optional_enrichment"],
        predecessorLaneIds: [],
        resourceClaims: [{
          resourceId: "optional:independent:p1",
          mode: "exclusive",
        }],
        effect: "read_only",
        requiredForPublication: false,
        inputDigests: [digest("optional-independent-p1")],
        outputKinds: ["refresh_audit"],
      }),
      lane({
        laneId: "optional-independent-p2",
        goal: "refresh_audit",
        operationVersion: "optional-independent-p2.1",
        priority: "P2",
        priorityReasonCodes: ["optional_audit"],
        predecessorLaneIds: [],
        resourceClaims: [{
          resourceId: "optional:independent:p2",
          mode: "exclusive",
        }],
        effect: "read_only",
        requiredForPublication: false,
        inputDigests: [digest("optional-independent-p2")],
        outputKinds: ["refresh_audit"],
      }),
    );
    const plan = buildTaskMapRefreshPlan(draft);
    const batch = selectTaskMapReadyBatch(plan, {
      maxConcurrency: 3,
      laneStates: laneStates(plan, {
        [LANE_IDS.collectCalendar]: { status: "running" },
      }),
    });
    assert.deepStrictEqual(batch.selectedLaneIds, [
      "optional-independent-p1",
      "optional-independent-p2",
    ]);
    assert.ok(!batch.selectedLaneIds.includes(LANE_IDS.collectGranola));
    assert.strictEqual(batch.activeClaims.length, 1);
  });

  it("honors running shared/exclusive conflicts in both directions and checks every claim", () => {
    const sharedRunningDraft = canonicalDraft();
    for (const laneId of [
      LANE_IDS.collectCalendar,
      LANE_IDS.collectGranola,
    ]) {
      laneById(sharedRunningDraft, laneId).resourceClaims = [{
        resourceId: "provider:shared-read-pool",
        mode: laneId === LANE_IDS.collectCalendar ? "shared" : "exclusive",
      }];
    }
    const sharedRunningPlan =
      buildTaskMapRefreshPlan(sharedRunningDraft);
    const sharedRunningBatch = selectTaskMapReadyBatch(sharedRunningPlan, {
      maxConcurrency: 2,
      laneStates: laneStates(sharedRunningPlan, {
        [LANE_IDS.collectCalendar]: { status: "running" },
      }),
    });
    assert.deepStrictEqual(sharedRunningBatch.selectedLaneIds, []);
    assert.ok(
      JSON.stringify(sharedRunningBatch.activeClaims).includes(
        "provider:shared-read-pool",
      ),
    );

    const exclusiveRunningDraft = canonicalDraft();
    laneById(
      exclusiveRunningDraft,
      LANE_IDS.collectCalendar,
    ).resourceClaims = [
      { resourceId: "provider:a-running-free", mode: "shared" },
      { resourceId: "provider:z-second-claim", mode: "exclusive" },
    ];
    laneById(
      exclusiveRunningDraft,
      LANE_IDS.collectGranola,
    ).resourceClaims = [
      { resourceId: "provider:a-candidate-free", mode: "shared" },
      { resourceId: "provider:z-second-claim", mode: "shared" },
    ];
    const exclusiveRunningPlan =
      buildTaskMapRefreshPlan(exclusiveRunningDraft);
    const exclusiveRunningBatch = selectTaskMapReadyBatch(
      exclusiveRunningPlan,
      {
        maxConcurrency: 2,
        laneStates: laneStates(exclusiveRunningPlan, {
          [LANE_IDS.collectCalendar]: { status: "running" },
        }),
      },
    );
    assert.deepStrictEqual(exclusiveRunningBatch.selectedLaneIds, []);
    assert.strictEqual(
      planLaneById(
        exclusiveRunningPlan,
        LANE_IDS.collectGranola,
      ).resourceClaims[1].resourceId,
      "provider:z-second-claim",
    );
  });

  it("counts already-running lanes against maxConcurrency", () => {
    const plan = buildTaskMapRefreshPlan(canonicalDraft());
    const states = laneStates(plan, {
      [LANE_IDS.collectCalendar]: { status: "running" },
    });
    const full = selectTaskMapReadyBatch(plan, {
      maxConcurrency: 1,
      laneStates: states,
    });
    assert.deepStrictEqual(full.selectedLaneIds, []);

    const oneSlot = selectTaskMapReadyBatch(plan, {
      maxConcurrency: 2,
      laneStates: states,
    });
    assert.deepStrictEqual(
      oneSlot.selectedLaneIds,
      [LANE_IDS.collectGranola],
    );

    assert.throws(
      () => selectTaskMapReadyBatch(plan, {
        maxConcurrency: 1,
        laneStates: laneStates(plan, {
          [LANE_IDS.collectCalendar]: { status: "running" },
          [LANE_IDS.collectGranola]: { status: "running" },
        }),
      }),
      /already-running lanes exceed maxConcurrency/i,
    );
  });

  it("accepts exactly 64 only as the selector safety ceiling", () => {
    const plan = buildTaskMapRefreshPlan(canonicalDraft());
    const batch = selectTaskMapReadyBatch(plan, {
      maxConcurrency: TASKMAP_REFRESH_PLAN_LIMITS_V1.maxConcurrency,
      laneStates: laneStates(plan),
    });
    assert.strictEqual(batch.maxConcurrency, 64);
    assert.deepStrictEqual(batch.selectedLaneIds, [
      LANE_IDS.collectCalendar,
      LANE_IDS.collectGranola,
    ]);
  });

  it("rejects 65 running lanes before expanding conflicting active claims", () => {
    const draft = canonicalDraft();
    const runningLaneIds: string[] = [];
    for (let index = 0; index < 65; index += 1) {
      const laneId = `running-cap-${String(index).padStart(2, "0")}`;
      runningLaneIds.push(laneId);
      draft.lanes.push(optionalAuditLane(laneId, {
        resourceClaims: [{
          resourceId: "audit:deliberately-conflicting-running-claim",
          mode: "exclusive",
        }],
      }));
    }
    const plan = buildTaskMapRefreshPlan(draft);
    const running = new Set(runningLaneIds);
    const states = plan.lanes.map((plannedLane) => ({
      laneId: plannedLane.laneId,
      status: (
        running.has(plannedLane.laneId) ? "running" : "pending"
      ) as TaskMapRefreshLaneStateV1["status"],
    }));
    assert.throws(
      () => selectTaskMapReadyBatch(plan, {
        maxConcurrency: 64,
        laneStates: states,
      }),
      /already-running lanes exceed maxConcurrency/i,
    );
  });

  it("rejects contradictory claims already held by two running lanes", () => {
    const draft = canonicalDraft();
    laneById(draft, LANE_IDS.collectCalendar).resourceClaims = [{
      resourceId: "provider:running-conflict",
      mode: "exclusive",
    }];
    laneById(draft, LANE_IDS.collectGranola).resourceClaims = [{
      resourceId: "provider:running-conflict",
      mode: "shared",
    }];
    const plan = buildTaskMapRefreshPlan(draft);
    assert.throws(
      () => selectTaskMapReadyBatch(plan, {
        maxConcurrency: 2,
        laneStates: laneStates(plan, {
          [LANE_IDS.collectCalendar]: { status: "running" },
          [LANE_IDS.collectGranola]: { status: "running" },
        }),
      }),
      /already-running refresh lanes hold conflicting claims/i,
    );
  });

  it("handles a high-cardinality active claim set linearly and blocks a late conflict", () => {
    const draft = canonicalDraft();
    const claimCount = 2_048;
    const activeClaims = Array.from({ length: claimCount }, (_, index) => ({
      resourceId: `audit:high-cardinality:${String(index).padStart(4, "0")}`,
      mode: "shared" as const,
    }));
    draft.lanes.push(
      optionalAuditLane("high-cardinality-running", {
        resourceClaims: activeClaims,
      }),
      optionalAuditLane("high-cardinality-candidate", {
        resourceClaims: [
          {
            resourceId: "audit:candidate-free",
            mode: "shared",
          },
          {
            resourceId:
              `audit:high-cardinality:${String(claimCount - 1).padStart(4, "0")}`,
            mode: "exclusive",
          },
        ],
      }),
    );
    const plan = buildTaskMapRefreshPlan(draft);
    const states = plan.lanes.map((plannedLane) => ({
      laneId: plannedLane.laneId,
      status: (
        plannedLane.laneId === "high-cardinality-running"
          ? "running"
          : plannedLane.laneId === "high-cardinality-candidate"
            ? "pending"
            : "succeeded"
      ) as TaskMapRefreshLaneStateV1["status"],
    }));
    const batch = selectTaskMapReadyBatch(plan, {
      maxConcurrency: 2,
      laneStates: states,
    });
    assert.strictEqual(batch.activeClaims.length, claimCount);
    assert.deepStrictEqual(batch.selectedLaneIds, []);
  });

  it("derives omitted lane state as absent and rejects duplicate/extra state", () => {
    const plan = buildTaskMapRefreshPlan(canonicalDraft());
    const states = laneStates(plan);
    const omittedLaneId = states[0].laneId;
    const omitted = selectTaskMapReadyBatch(plan, {
      maxConcurrency: 2,
      laneStates: states.slice(1),
    });
    assert.deepStrictEqual(
      omitted.laneStates.find((state) => state.laneId === omittedLaneId),
      { laneId: omittedLaneId, status: "absent" },
    );
    assert.strictEqual(omitted.publication.state, "blocked");
    assert.strictEqual(omitted.publication.eligible, false);
    assert.ok(
      omitted.publication.reasonCodes.includes("required_lane_absent"),
    );

    assert.throws(
      () => selectTaskMapReadyBatch(plan, {
        maxConcurrency: 2,
        laneStates: [...states, structuredClone(states[0])],
      }),
      /duplicate.*state|state.*duplicate/i,
    );
    assert.throws(
      () => selectTaskMapReadyBatch(plan, {
        maxConcurrency: 2,
        laneStates: [
          ...states,
          { laneId: "extra-lane", status: "pending" },
        ],
      }),
      /state extra-lane is extra/i,
    );
  });

  it("rejects non-integer, non-number, and out-of-range concurrency", () => {
    const plan = buildTaskMapRefreshPlan(canonicalDraft());
    const invalidValues: unknown[] = [
      -1,
      0,
      1.5,
      65,
      Number.POSITIVE_INFINITY,
      Number.NaN,
      "2",
      null,
      undefined,
    ];
    for (const value of invalidValues) {
      assert.throws(
        () => selectTaskMapReadyBatch(plan, {
          maxConcurrency: value,
          laneStates: [],
        } as unknown as Parameters<typeof selectTaskMapReadyBatch>[1]),
        /maxConcurrency must be an integer from 1 to 64|finite JSON numbers|must contain JSON data values/i,
        `maxConcurrency=${String(value)}`,
      );
    }
  });

  it("rejects running, succeeded, partial, or failed descendants before prerequisites", () => {
    const plan = buildTaskMapRefreshPlan(canonicalDraft());
    const cases = [
      { laneId: LANE_IDS.authorityGate, prerequisiteStates: {} },
      {
        laneId: LANE_IDS.projection,
        prerequisiteStates: stateOverridesThroughBarrier(),
      },
      {
        laneId: LANE_IDS.publication,
        prerequisiteStates: {
          ...stateOverridesThroughBarrier(),
          [LANE_IDS.authorityGate]: { status: "succeeded" as const },
          [LANE_IDS.lifecycleGate]: { status: "succeeded" as const },
        },
      },
    ];
    for (const { laneId, prerequisiteStates } of cases) {
      for (const status of [
        "running",
        "succeeded",
        "partial",
        "failed",
      ] as const) {
        const target: Partial<TaskMapRefreshLaneStateV1> = { status };
        if (status === "partial" || status === "failed") {
          target.errorCode = "refresh_operation_failed";
          target.errorDetailDigest = digest(
            `impossible-${laneId}-${status}`,
          );
        }
        assert.throws(
          () => selectTaskMapReadyBatch(plan, {
            maxConcurrency: 4,
            laneStates: laneStates(plan, {
              ...prerequisiteStates,
              [laneId]: target,
            }),
          }),
          /predecessor.*succeeded|active.*requires/i,
          `${laneId}:${status}`,
        );
      }
    }
  });

  it("rejects a skipped descendant before every predecessor is terminal", () => {
    const plan = buildTaskMapRefreshPlan(canonicalDraft());
    assert.throws(
      () => selectTaskMapReadyBatch(plan, {
        maxConcurrency: 4,
        laneStates: laneStates(plan, {
          ...stateOverridesThroughBarrier(),
          [LANE_IDS.authorityGate]: { status: "succeeded" },
          [LANE_IDS.projection]: {
            status: "skipped",
            errorCode: "upstream_unusable",
            errorDetailDigest: digest("projection-skipped-too-early"),
          },
        }),
      }),
      /skipped refresh lane requires terminal predecessor histories/i,
    );
  });

  it("requires skipped work to follow a terminal non-success predecessor", () => {
    const plan = buildTaskMapRefreshPlan(canonicalDraft());

    assert.throws(
      () => selectTaskMapReadyBatch(plan, {
        maxConcurrency: 4,
        laneStates: laneStates(plan, {
          [LANE_IDS.collectCalendar]: {
            status: "skipped",
            lastGoodCheckpointDigest:
              SOURCE_ARTIFACTS.calendar.priorCheckpointDigest,
            lastGoodSourceSliceDigest:
              SOURCE_ARTIFACTS.calendar.priorSourceSliceDigest,
            errorCode: "upstream_unusable",
            errorDetailDigest: digest("root-collect-cannot-skip"),
          },
        }),
      }),
      /skipped.*predecessor|predecessor-free.*skipped/i,
    );

    assert.throws(
      () => selectTaskMapReadyBatch(plan, {
        maxConcurrency: 4,
        laneStates: laneStates(plan, {
          [LANE_IDS.collectCalendar]: { status: "succeeded" },
          [LANE_IDS.normalizeCalendar]: {
            status: "skipped",
            lastGoodCheckpointDigest:
              SOURCE_ARTIFACTS.calendar.priorCheckpointDigest,
            lastGoodSourceSliceDigest:
              SOURCE_ARTIFACTS.calendar.priorSourceSliceDigest,
            errorCode: "upstream_unusable",
            errorDetailDigest: digest(
              "normalize-cannot-skip-success",
            ),
          },
        }),
      }),
      /skipped.*non-succeeded|upstream.*non-success/i,
    );

    assert.throws(
      () => selectTaskMapReadyBatch(plan, {
        maxConcurrency: 4,
        laneStates: laneStates(plan, {
          [LANE_IDS.collectCalendar]: { status: "succeeded" },
          [LANE_IDS.collectGranola]: { status: "succeeded" },
          [LANE_IDS.normalizeCalendar]: { status: "succeeded" },
          [LANE_IDS.normalizeGranola]: { status: "succeeded" },
          [LANE_IDS.identityBarrier]: {
            status: "skipped",
            errorCode: "upstream_unusable",
            errorDetailDigest: digest(
              "barrier-cannot-skip-success",
            ),
          },
        }),
      }),
      /skipped identity barrier.*non-succeeded/i,
    );

    assert.throws(
      () => selectTaskMapReadyBatch(plan, {
        maxConcurrency: 4,
        laneStates: laneStates(plan, {
          ...stateOverridesThroughBarrier(),
          [LANE_IDS.authorityGate]: {
            status: "skipped",
            errorCode: "upstream_unusable",
            errorDetailDigest: digest("gate-cannot-skip-success"),
          },
        }),
      }),
      /skipped.*non-succeeded|upstream.*non-success/i,
    );

    assert.throws(
      () => selectTaskMapReadyBatch(plan, {
        maxConcurrency: 4,
        laneStates: laneStates(plan, {
          ...stateOverridesThroughBarrier(),
          [LANE_IDS.authorityGate]: { status: "succeeded" },
          [LANE_IDS.lifecycleGate]: { status: "succeeded" },
          [LANE_IDS.projection]: { status: "succeeded" },
          [LANE_IDS.publication]: {
            status: "skipped",
            errorCode: "upstream_unusable",
            errorDetailDigest: digest(
              "publication-cannot-skip-success",
            ),
          },
        }),
      }),
      /skipped.*non-succeeded|upstream.*non-success/i,
    );

    const validCascade = selectTaskMapReadyBatch(plan, {
      maxConcurrency: 4,
      laneStates: laneStates(plan, {
        ...stateOverridesThroughBarrier(),
        [LANE_IDS.authorityGate]: {
          status: "failed",
          errorCode: "deterministic_gate_failed",
          errorDetailDigest: digest("authority-gate-failed"),
        },
        [LANE_IDS.lifecycleGate]: { status: "succeeded" },
        [LANE_IDS.projection]: {
          status: "skipped",
          errorCode: "upstream_unusable",
          errorDetailDigest: digest("projection-valid-skip"),
        },
      }),
    });
    assert.deepStrictEqual(
      validCascade.laneStates.find(
        (state) => state.laneId === LANE_IDS.projection,
      ),
      {
        laneId: LANE_IDS.projection,
        status: "skipped",
        errorCode: "upstream_unusable",
        errorDetailDigest: digest("projection-valid-skip"),
      },
    );
    assert.strictEqual(validCascade.publication.eligible, false);
  });

  it("rejects active or skipped barrier history before providers are usable or terminal", () => {
    const plan = buildTaskMapRefreshPlan(canonicalDraft());
    assert.throws(
      () => selectTaskMapReadyBatch(plan, {
        maxConcurrency: 4,
        laneStates: laneStates(plan, {
          [LANE_IDS.identityBarrier]: { status: "running" },
        }),
      }),
      /active identity barrier requires usable all-settled provider histories/i,
    );

    assert.throws(
      () => selectTaskMapReadyBatch(plan, {
        maxConcurrency: 4,
        laneStates: laneStates(plan, {
          [LANE_IDS.collectCalendar]: { status: "succeeded" },
          [LANE_IDS.collectGranola]: { status: "succeeded" },
          [LANE_IDS.normalizeCalendar]: { status: "succeeded" },
          [LANE_IDS.identityBarrier]: {
            status: "skipped",
            errorCode: "upstream_unusable",
            errorDetailDigest: digest("barrier-skipped-too-early"),
          },
        }),
      }),
      /skipped identity barrier requires terminal provider histories/i,
    );
  });

  it("records a first-run provider failure but keeps the barrier unusable", () => {
    const draft = canonicalDraft();
    draft.baseline = {
      kind: "genesis",
      priorCheckpointDigests: [],
      priorSourceSliceDigests: [],
      priorProviderArtifacts: [],
      acceptedSourceRevisions: [],
      acceptedSourceRevisionSets: [],
      acceptedSemanticInputDigests: [],
    };
    for (const laneId of [
      LANE_IDS.collectCalendar,
      LANE_IDS.normalizeCalendar,
    ]) {
      const providerLane = laneById(draft, laneId);
      providerLane.inputDigests = providerLane.inputDigests.filter(
        (inputDigest) => (
          inputDigest !== SOURCE_ARTIFACTS.calendar.priorCheckpointDigest
          && inputDigest !== SOURCE_ARTIFACTS.calendar.priorSourceSliceDigest
        ),
      );
    }
    for (const laneId of [
      LANE_IDS.collectGranola,
      LANE_IDS.normalizeGranola,
    ]) {
      const providerLane = laneById(draft, laneId);
      providerLane.inputDigests = providerLane.inputDigests.filter(
        (inputDigest) => (
          inputDigest !== SOURCE_ARTIFACTS.granola.priorCheckpointDigest
          && inputDigest !== SOURCE_ARTIFACTS.granola.priorSourceSliceDigest
        ),
      );
    }
    const plan = buildTaskMapRefreshPlan(draft);
    const batch = selectTaskMapReadyBatch(plan, {
      maxConcurrency: 2,
      laneStates: laneStates(plan, {
        [LANE_IDS.collectCalendar]: {
          status: "failed",
          errorCode: "provider_unavailable",
          errorDetailDigest: digest("first-refresh-failed"),
        },
        [LANE_IDS.collectGranola]: { status: "succeeded" },
        [LANE_IDS.normalizeCalendar]: {
          status: "skipped",
          errorCode: "upstream_unusable",
          errorDetailDigest: digest("upstream-unusable"),
        },
        [LANE_IDS.normalizeGranola]: { status: "succeeded" },
      }),
    });
    assert.deepStrictEqual(
      assertTaskMapReadyBatch(plan, batch),
      batch,
    );
    assert.ok(!batch.selectedLaneIds.includes(LANE_IDS.identityBarrier));
    assert.strictEqual(batch.publication.state, "blocked");
    assert.ok(
      batch.publication.reasonCodes.includes("required_lane_failed"),
    );
    assert.ok(
      batch.publication.reasonCodes.includes("required_lane_skipped"),
    );
  });

  it("keeps the all-settled barrier waiting for every normalizer", () => {
    const plan = buildTaskMapRefreshPlan(canonicalDraft());
    const batch = selectTaskMapReadyBatch(plan, {
      maxConcurrency: 3,
      laneStates: laneStates(plan, {
        [LANE_IDS.collectCalendar]: { status: "succeeded" },
        [LANE_IDS.collectGranola]: { status: "succeeded" },
        [LANE_IDS.normalizeCalendar]: { status: "succeeded" },
      }),
    });
    assert.ok(!batch.selectedLaneIds.includes(LANE_IDS.identityBarrier));
    assert.deepStrictEqual(
      batch.selectedLaneIds,
      [LANE_IDS.normalizeGranola],
    );
  });

  for (const settledStatus of ["failed", "partial", "skipped"] as const) {
    it(`allows the all-settled barrier after a retained-last-good ${settledStatus} normalizer`, () => {
      const plan = buildTaskMapRefreshPlan(canonicalDraft());
      const granolaCollectState:
      Partial<TaskMapRefreshLaneStateV1> = settledStatus === "skipped"
        ? {
          status: "failed",
          lastGoodCheckpointDigest:
            SOURCE_ARTIFACTS.granola.priorCheckpointDigest,
          lastGoodSourceSliceDigest:
            SOURCE_ARTIFACTS.granola.priorSourceSliceDigest,
          errorCode: "provider_unavailable",
          errorDetailDigest: digest("granola-upstream-failed"),
        }
        : { status: "succeeded" };
      const batch = selectTaskMapReadyBatch(plan, {
        maxConcurrency: 2,
        laneStates: laneStates(plan, {
          [LANE_IDS.collectCalendar]: { status: "succeeded" },
          [LANE_IDS.collectGranola]: granolaCollectState,
          [LANE_IDS.normalizeCalendar]: { status: "succeeded" },
          [LANE_IDS.normalizeGranola]: {
            status: settledStatus,
            lastGoodCheckpointDigest: digest("granola-last-good-checkpoint"),
            lastGoodSourceSliceDigest: digest("granola-last-good-source-slice"),
            errorCode: settledStatus === "partial"
              ? "provider_partial_result"
              : settledStatus === "skipped"
                ? "upstream_unusable"
                : "provider_unavailable",
            errorDetailDigest: digest(`granola-${settledStatus}-error`),
          },
        }),
      });
      assert.deepStrictEqual(
        batch.selectedLaneIds,
        [LANE_IDS.identityBarrier],
      );
    });
  }

  it("does not pass a failed normalizer without both retained-last-good refs", () => {
    const plan = buildTaskMapRefreshPlan(canonicalDraft());
    assert.throws(
      () => selectTaskMapReadyBatch(plan, {
        maxConcurrency: 2,
        laneStates: laneStates(plan, {
          [LANE_IDS.collectCalendar]: { status: "succeeded" },
          [LANE_IDS.collectGranola]: { status: "succeeded" },
          [LANE_IDS.normalizeCalendar]: { status: "succeeded" },
          [LANE_IDS.normalizeGranola]: {
            status: "failed",
            lastGoodCheckpointDigest:
              SOURCE_ARTIFACTS.granola.priorCheckpointDigest,
            errorCode: "provider_unavailable",
            errorDetailDigest: digest("granola-error"),
          },
        }),
      }),
      /both last-good refs|lastGoodSourceSliceDigest.*full lowercase SHA-256/i,
    );
  });

  it("rejects cross-provider last-good checkpoint/source-slice pairing", () => {
    const draft = canonicalDraft();
    laneById(draft, LANE_IDS.collectCalendar).inputDigests.push(
      SOURCE_ARTIFACTS.granola.priorCheckpointDigest,
      SOURCE_ARTIFACTS.granola.priorSourceSliceDigest,
    );
    assert.throws(
      () => buildTaskMapRefreshPlan(draft),
      /provider lane input digests.*derived|prior artifacts/i,
    );
  });

  it("waits for every deterministic gate before selecting projection", () => {
    const plan = buildTaskMapRefreshPlan(canonicalDraft());
    const oneGatePending = selectTaskMapReadyBatch(plan, {
      maxConcurrency: 2,
      laneStates: laneStates(plan, {
        ...stateOverridesThroughBarrier(),
        [LANE_IDS.authorityGate]: { status: "succeeded" },
      }),
    });
    assert.ok(!oneGatePending.selectedLaneIds.includes(LANE_IDS.projection));
    assert.deepStrictEqual(
      oneGatePending.selectedLaneIds,
      [LANE_IDS.lifecycleGate],
    );

    const gatesSettled = selectTaskMapReadyBatch(plan, {
      maxConcurrency: 2,
      laneStates: laneStates(plan, {
        ...stateOverridesThroughBarrier(),
        [LANE_IDS.authorityGate]: { status: "succeeded" },
        [LANE_IDS.lifecycleGate]: { status: "succeeded" },
      }),
    });
    assert.deepStrictEqual(
      gatesSettled.selectedLaneIds,
      [LANE_IDS.projection],
    );
  });

  for (const blockingStatus of ["failed", "partial"] as const) {
    it(`blocks publication on a required ${blockingStatus} and preserves the accepted state`, () => {
      const draft = canonicalDraft();
      const priorAcceptedStateDigest =
        draft.baseline.priorAcceptedStateDigest!;
      const plan = buildTaskMapRefreshPlan(draft);
      const batch = selectTaskMapReadyBatch(plan, {
        maxConcurrency: 2,
        laneStates: laneStates(plan, {
          [LANE_IDS.collectCalendar]: { status: "succeeded" },
          [LANE_IDS.collectGranola]: { status: "succeeded" },
          [LANE_IDS.normalizeCalendar]: { status: "succeeded" },
          [LANE_IDS.normalizeGranola]: {
            status: blockingStatus,
            lastGoodCheckpointDigest: digest("granola-last-good-checkpoint"),
            lastGoodSourceSliceDigest: digest("granola-last-good-source-slice"),
            errorCode: blockingStatus === "partial"
              ? "provider_partial_result"
              : "provider_unavailable",
            errorDetailDigest: digest(`granola-${blockingStatus}-error`),
          },
          [LANE_IDS.identityBarrier]: { status: "succeeded" },
          [LANE_IDS.authorityGate]: { status: "succeeded" },
          [LANE_IDS.lifecycleGate]: { status: "succeeded" },
          [LANE_IDS.projection]: { status: "succeeded" },
        }),
      });
      assert.strictEqual(publicationState(batch), "blocked");
      assert.ok(!batch.selectedLaneIds.includes(LANE_IDS.publication));
      assert.strictEqual(
        preservedAcceptedStateDigest(batch),
        priorAcceptedStateDigest,
      );
      const publication = publicationRecord(batch);
      if (publication.preservesPriorAcceptedState !== undefined) {
        assert.strictEqual(publication.preservesPriorAcceptedState, true);
      }
    });
  }

  it("keeps every non-success required status publication-ineligible", () => {
    const plan = buildTaskMapRefreshPlan(canonicalDraft());
    const targetLaneId = LANE_IDS.authorityGate;
    const cases = [
      {
        status: "absent" as const,
        reasonCode: "required_lane_absent",
      },
      {
        status: "pending" as const,
        reasonCode: "required_lane_pending",
      },
      {
        status: "running" as const,
        reasonCode: "required_lane_running",
      },
      {
        status: "failed" as const,
        reasonCode: "required_lane_failed",
      },
      {
        status: "skipped" as const,
        reasonCode: "required_lane_skipped",
      },
    ];
    for (const row of cases) {
      const succeededLaneIds = new Set<string>([
        LANE_IDS.collectCalendar,
        LANE_IDS.collectGranola,
        LANE_IDS.normalizeCalendar,
        LANE_IDS.normalizeGranola,
        LANE_IDS.identityBarrier,
        LANE_IDS.lifecycleGate,
      ]);
      let states = plan.lanes.map((plannedLane) => ({
        laneId: plannedLane.laneId,
        status: (succeededLaneIds.has(plannedLane.laneId)
          ? "succeeded"
          : "pending") as TaskMapRefreshLaneStateV1["status"],
      }));
      if (row.status === "absent") {
        states = states.filter((state) => state.laneId !== targetLaneId);
      } else {
        const target = states.find((state) => state.laneId === targetLaneId)!;
        target.status = row.status;
        if (row.status === "failed" || row.status === "skipped") {
          Object.assign(target, {
            errorCode: row.status === "skipped"
              ? "upstream_unusable"
              : "deterministic_gate_failed",
            errorDetailDigest: digest(`required-${row.status}`),
          });
        }
      }
      if (row.status === "skipped") {
        const barrier = states.find(
          (state) => state.laneId === LANE_IDS.identityBarrier,
        )!;
        Object.assign(barrier, {
          status: "failed",
          errorCode: "refresh_operation_failed",
          errorDetailDigest: digest("barrier-upstream-failed"),
        });
        const lifecycle = states.find(
          (state) => state.laneId === LANE_IDS.lifecycleGate,
        )!;
        Object.assign(lifecycle, {
          status: "skipped",
          errorCode: "upstream_unusable",
          errorDetailDigest: digest("lifecycle-upstream-skipped"),
        });
      }
      const batch = selectTaskMapReadyBatch(plan, {
        maxConcurrency: 4,
        laneStates: states,
      });
      assert.strictEqual(
        batch.publication.eligible,
        false,
        row.status,
      );
      assert.ok(
        !batch.selectedLaneIds.includes(LANE_IDS.publication),
        row.status,
      );
      assert.ok(
        batch.publication.reasonCodes.includes(
          row.reasonCode as typeof batch.publication.reasonCodes[number],
        ),
        `${row.status}: ${batch.publication.reasonCodes.join(",")}`,
      );
    }
  });

  it("keeps optional failure visible without blocking publication", () => {
    const draft = canonicalDraft();
    draft.lanes.push(lane({
      laneId: "optional-refresh-audit",
      goal: "refresh_audit",
      operationVersion: "optional-audit.1",
      priority: "P2",
      priorityReasonCodes: ["optional_audit"],
      predecessorLaneIds: [LANE_IDS.projection],
      resourceClaims: [{
        resourceId: "taskmap:optional-audit",
        mode: "shared",
      }],
      effect: "read_only",
      requiredForPublication: false,
      inputDigests: [digest("optional-audit-input")],
      outputKinds: ["refresh_audit"],
    }));
    const plan = buildTaskMapRefreshPlan(draft);
    const states: TaskMapRefreshLaneStateV1[] = plan.lanes.map(
      (plannedLane) => {
      if (plannedLane.laneId === LANE_IDS.publication) {
        return {
          laneId: plannedLane.laneId,
          status: "pending" as const,
        };
      }
      if (plannedLane.laneId === "optional-refresh-audit") {
        return {
          laneId: plannedLane.laneId,
          status: "failed" as const,
          errorCode: "optional_lane_failed",
          errorDetailDigest: digest("optional-audit-error"),
        };
      }
      return {
        laneId: plannedLane.laneId,
        status: "succeeded" as const,
      };
      },
    );
    const batch = selectTaskMapReadyBatch(plan, {
      maxConcurrency: 2,
      laneStates: states,
    });
    assert.strictEqual(batch.publication.state, "ready");
    assert.strictEqual(batch.publication.eligible, true);
    assert.ok(batch.selectedLaneIds.includes(LANE_IDS.publication));
    assert.deepStrictEqual(
      batch.laneStates.find(
        (state) => state.laneId === "optional-refresh-audit",
      ),
      {
        laneId: "optional-refresh-audit",
        status: "failed",
        errorCode: "optional_lane_failed",
        errorDetailDigest: digest("optional-audit-error"),
      },
    );
  });

  it("turns exact source+semantic-input+replay equality into a no-op", () => {
    const draft = exactNoOpDraft();
    const priorAcceptedStateDigest =
      draft.baseline.priorAcceptedStateDigest!;
    const plan = buildTaskMapRefreshPlan(draft);
    assert.strictEqual(isExactNoOp(plan), true);
    const batch = selectTaskMapReadyBatch(plan, {
      maxConcurrency: 4,
      laneStates: laneStates(plan),
    });
    assert.deepStrictEqual(batch.selectedLaneIds, []);
    assert.strictEqual(publicationState(batch), "no_op");
    assert.strictEqual(
      preservedAcceptedStateDigest(batch),
      priorAcceptedStateDigest,
    );
  });

  it("keeps semantic publication a no-op while scheduling independent optional audit work", () => {
    const draft = exactNoOpDraft();
    draft.lanes.push(optionalAuditLane("optional-noop-audit", {
      priority: "P1",
      priorityReasonCodes: ["connector_visibility"],
    }));
    const plan = buildTaskMapRefreshPlan(draft);
    assert.strictEqual(plan.isExactNoOp, true);
    const batch = selectTaskMapReadyBatch(plan, {
      maxConcurrency: 4,
      laneStates: laneStates(plan),
    });

    assert.deepStrictEqual(
      batch.selectedLaneIds,
      ["optional-noop-audit"],
    );
    assert.strictEqual(batch.publication.state, "no_op");
    assert.strictEqual(batch.publication.eligible, false);
    assert.strictEqual(
      batch.candidateAcceptedStateDigest,
      draft.baseline.priorAcceptedStateDigest,
    );
    assert.ok(
      batch.selectedLaneIds.every(
        (laneId) => !planLaneById(plan, laneId).requiredForPublication,
      ),
    );
  });

  it("keeps plan/candidate identity static while dynamic state, claims, and errors change batchId", () => {
    const plan = buildTaskMapRefreshPlan(canonicalDraft());
    const pending = selectTaskMapReadyBatch(plan, {
      maxConcurrency: 2,
      laneStates: laneStates(plan),
    });
    const running = selectTaskMapReadyBatch(plan, {
      maxConcurrency: 2,
      laneStates: laneStates(plan, {
        [LANE_IDS.collectCalendar]: { status: "running" },
      }),
    });
    const failedA = selectTaskMapReadyBatch(plan, {
      maxConcurrency: 2,
      laneStates: laneStates(plan, {
        [LANE_IDS.collectCalendar]: {
          status: "failed",
          lastGoodCheckpointDigest: digest("calendar-last-good-checkpoint"),
          lastGoodSourceSliceDigest: digest("calendar-last-good-source-slice"),
          errorCode: "provider_unavailable",
          errorDetailDigest: digest("calendar-error-a"),
        },
      }),
    });
    const failedB = selectTaskMapReadyBatch(plan, {
      maxConcurrency: 2,
      laneStates: laneStates(plan, {
        [LANE_IDS.collectCalendar]: {
          status: "failed",
          lastGoodCheckpointDigest: digest("calendar-last-good-checkpoint"),
          lastGoodSourceSliceDigest: digest("calendar-last-good-source-slice"),
          errorCode: "provider_unavailable",
          errorDetailDigest: digest("calendar-error-b"),
        },
      }),
    });

    assert.strictEqual(pending.planId, plan.planId);
    assert.strictEqual(running.planId, plan.planId);
    assert.strictEqual(failedA.planId, plan.planId);
    assert.strictEqual(failedB.planId, plan.planId);
    assert.notStrictEqual(pending.batchId, running.batchId);
    assert.notStrictEqual(running.batchId, failedA.batchId);
    assert.notStrictEqual(failedA.batchId, failedB.batchId);
    assert.strictEqual(
      candidateAcceptedStateDigest(plan, pending),
      candidateAcceptedStateDigest(plan, running),
    );
    assert.strictEqual(
      candidateAcceptedStateDigest(plan, running),
      candidateAcceptedStateDigest(plan, failedA),
    );
    assert.ok(JSON.stringify(running.activeClaims).includes("google_calendar"));
  });

  it("matches a scheduling oracle for generated DAGs with 1–64 optional lanes", () => {
    for (let count = 1; count <= 64; count += 1) {
      const draft = canonicalDraft();
      const optionalLaneIds: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const laneId = `optional-node-${String(index).padStart(2, "0")}`;
        const predecessorLaneIds: string[] = [LANE_IDS.projection];
        if (index > 0 && index % 4 !== 0) {
          predecessorLaneIds.push(
            optionalLaneIds[Math.floor((index - 1) / 2)],
          );
        }
        const willRun = index % 11 === 1;
        draft.lanes.push(lane({
          laneId,
          goal: "refresh_audit",
          operationVersion: `generated-audit.${index + 1}`,
          priority: index % 2 === 0 ? "P1" : "P2",
          priorityReasonCodes: [
            index % 2 === 0 ? "optional_enrichment" : "optional_audit",
          ],
          predecessorLaneIds,
          resourceClaims: [{
            resourceId: `optional:resource:${index % 11}`,
            mode: willRun || index % 4 !== 0 ? "shared" : "exclusive",
          }],
          effect: "read_only",
          requiredForPublication: false,
          inputDigests: [digest(`optional-input-${index}`)],
          outputKinds: ["refresh_audit"],
        }));
        optionalLaneIds.push(laneId);
      }

      const plan = buildTaskMapRefreshPlan(draft);
      const optionalLaneIdSet = new Set(optionalLaneIds);
      const optionalStatuses = new Map<
        string,
        TaskMapRefreshLaneStateV1["status"]
      >();
      for (let index = 0; index < optionalLaneIds.length; index += 1) {
        const plannedLane = planLaneById(plan, optionalLaneIds[index]);
        const optionalPredecessors = plannedLane.predecessorLaneIds.filter(
          (predecessor) => optionalLaneIdSet.has(predecessor),
        );
        const predecessorsSucceeded = optionalPredecessors.every(
          (predecessor) => optionalStatuses.get(predecessor) === "succeeded",
        );
        const status = !predecessorsSucceeded
          ? "pending"
          : index % 11 === 1
            ? "running"
            : index % 5 === 0
              ? "succeeded"
              : "pending";
        optionalStatuses.set(optionalLaneIds[index], status);
      }
      const states: TaskMapRefreshLaneStateV1[] = plan.lanes.map(
        (plannedLane) => {
          if (!optionalLaneIdSet.has(plannedLane.laneId)) {
            return {
              laneId: plannedLane.laneId,
              status: "succeeded",
            };
          }
          return {
            laneId: plannedLane.laneId,
            status: optionalStatuses.get(plannedLane.laneId)!,
          };
        },
      );
      const runningCount = states.filter(
        (state) => state.status === "running",
      ).length;
      const maxConcurrency = Math.max(runningCount, 1 + (count % 8));
      const batch = selectTaskMapReadyBatch(plan, {
        maxConcurrency,
        laneStates: states,
      });
      assert.deepStrictEqual(
        batch.selectedLaneIds,
        schedulingOracle(plan, states, maxConcurrency),
        `optional lane count ${count}`,
      );

      const permuted = structuredClone(draft);
      const random = seededRandom(10_000 + count);
      shuffleInPlace(permuted.lanes, random);
      for (const plannedLane of permuted.lanes) {
        shuffleInPlace(plannedLane.predecessorLaneIds, random);
        shuffleInPlace(plannedLane.resourceClaims, random);
      }
      const permutedPlan = buildTaskMapRefreshPlan(permuted);
      const permutedStates = structuredClone(states);
      shuffleInPlace(permutedStates, random);
      const permutedBatch = selectTaskMapReadyBatch(permutedPlan, {
        maxConcurrency,
        laneStates: permutedStates,
      });
      assert.strictEqual(permutedPlan.planId, plan.planId);
      assert.deepStrictEqual(permutedBatch, batch);
    }
  });

  it("rejects error codes that are incompatible with lane stage and status", () => {
    const plan = buildTaskMapRefreshPlan(canonicalDraft());
    const cases: Array<{
      laneId: string;
      state: Partial<TaskMapRefreshLaneStateV1>;
    }> = [
      {
        laneId: LANE_IDS.collectCalendar,
        state: {
          status: "failed",
          lastGoodCheckpointDigest:
            SOURCE_ARTIFACTS.calendar.priorCheckpointDigest,
          lastGoodSourceSliceDigest:
            SOURCE_ARTIFACTS.calendar.priorSourceSliceDigest,
          errorCode: "publication_failed",
          errorDetailDigest: digest("collect-publication-error"),
        },
      },
      {
        laneId: LANE_IDS.collectCalendar,
        state: {
          status: "partial",
          lastGoodCheckpointDigest:
            SOURCE_ARTIFACTS.calendar.priorCheckpointDigest,
          lastGoodSourceSliceDigest:
            SOURCE_ARTIFACTS.calendar.priorSourceSliceDigest,
          errorCode: "provider_unavailable",
          errorDetailDigest: digest("collect-wrong-partial-error"),
        },
      },
      {
        laneId: LANE_IDS.authorityGate,
        state: {
          status: "failed",
          errorCode: "provider_unavailable",
          errorDetailDigest: digest("gate-provider-error"),
        },
      },
      {
        laneId: LANE_IDS.publication,
        state: {
          status: "skipped",
          errorCode: "publication_failed",
          errorDetailDigest: digest("publication-wrong-skipped-error"),
        },
      },
    ];
    for (const row of cases) {
      assert.throws(
        () => selectTaskMapReadyBatch(plan, {
          maxConcurrency: 4,
          laneStates: laneStates(plan, {
            [row.laneId]: row.state,
          }),
        }),
        /errorCode is incompatible with its stage and status/i,
        row.laneId,
      );
    }
  });

  it("validates dynamic status/error enums and digest fields", () => {
    const plan = buildTaskMapRefreshPlan(canonicalDraft());
    const unknownStatus = laneStates(plan) as unknown as JsonRecord[];
    unknownStatus[0].status = "cancelled";
    assert.throws(
      () => selectTaskMapReadyBatch(plan, {
        maxConcurrency: 2,
        laneStates:
          unknownStatus as unknown as TaskMapRefreshLaneStateV1[],
      }),
      /status|unsupported|invalid/i,
    );

    for (const errorCode of [
      "provider_timeout",
      "participant:alice-smith",
    ]) {
      const unknownErrorCode =
        laneStates(plan) as unknown as JsonRecord[];
      Object.assign(unknownErrorCode[0], {
        status: "failed",
        errorCode,
        errorDetailDigest: digest(`unknown-error-code-${errorCode}`),
      });
      assert.throws(
        () => selectTaskMapReadyBatch(plan, {
          maxConcurrency: 2,
          laneStates:
            unknownErrorCode as unknown as TaskMapRefreshLaneStateV1[],
        }),
        /errorCode.*unknown|bounded ASCII opaque identifier/i,
        errorCode,
      );
    }

    for (const unsafeErrorDetail of [
      "raw provider error",
      "/Users/neo/private/error",
      "owner@example.com",
      "ghp_abcdefghijklmnopqrstuvwxyz123456",
    ]) {
      const rawError = laneStates(plan, {
        [LANE_IDS.collectCalendar]: {
          status: "failed",
          errorCode: "provider_unavailable",
          errorDetailDigest: unsafeErrorDetail,
        },
      });
      assert.throws(
        () => selectTaskMapReadyBatch(plan, {
          maxConcurrency: 2,
          laneStates: rawError,
        }),
        /digest|error/i,
      );
    }

    const unknownStateField = laneStates(plan) as unknown as JsonRecord[];
    unknownStateField[0].fixedNow = "2026-07-28T00:00:00.000Z";
    assert.throws(
      () => selectTaskMapReadyBatch(plan, {
        maxConcurrency: 2,
        laneStates:
          unknownStateField as unknown as TaskMapRefreshLaneStateV1[],
      }),
      /unknown|field|fixedNow/i,
    );
  });
});

describe("P9.2 checkpoint integration", () => {
  it("references the full digest of a checkpoint built by the frozen P9.2 API", () => {
    const checkpoint = advanceTaskMapConnectorCheckpoint(null, {
      binding: {
        connectionId: "synthetic-calendar-connection",
        sourceKind: "google_calendar",
        tenantOrWorkspaceDigest: digest("synthetic-workspace"),
        accountOrPrincipalDigest: digest("synthetic-principal"),
        grantVersion: "synthetic-read.1",
      },
      sourceKind: "google_calendar",
      adapterVersion: "google-calendar-adapter.1",
      capabilities: ["read_task", "read_context"],
      state: "success",
      attemptedAt: "2026-07-28T02:00:00.000Z",
      proposedWatermark: {
        kind: "revision",
        valueDigest: digest("calendar-watermark"),
        observedThrough: "2026-07-28T02:00:00.000Z",
      },
      acceptedSourceIdentityDigests: [digest("accepted-calendar-source")],
    });
    const checkpointDigest = taskMapContractDigest(checkpoint);
    assert.match(checkpointDigest, SHA256);
    assert.notStrictEqual(checkpointDigest, checkpoint.checkpointId);

    const draft = canonicalDraft();
    draft.baseline.priorCheckpointDigests = [
      checkpointDigest,
      SOURCE_ARTIFACTS.granola.priorCheckpointDigest,
    ];
    draft.baseline.priorProviderArtifacts.find(
      (artifact) => (
        artifact.bindingDigest === SOURCE_ARTIFACTS.calendar.bindingDigest
      ),
    )!.checkpointDigest = checkpointDigest;
    for (const laneId of [
      LANE_IDS.collectCalendar,
      LANE_IDS.normalizeCalendar,
    ]) {
      const checkpointLane = laneById(draft, laneId);
      checkpointLane.inputDigests = checkpointLane.inputDigests.map(
        (inputDigest) => (
          inputDigest === SOURCE_ARTIFACTS.calendar.priorCheckpointDigest
            ? checkpointDigest
            : inputDigest
        ),
      );
    }
    const plan = buildTaskMapRefreshPlan(draft);
    assert.ok(
      plan.baseline.priorCheckpointDigests.includes(checkpointDigest),
    );

    const truncated = canonicalDraft();
    truncated.baseline.priorCheckpointDigests = [
      checkpoint.checkpointId,
      SOURCE_ARTIFACTS.granola.priorCheckpointDigest,
    ];
    truncated.baseline.priorProviderArtifacts.find(
      (artifact) => (
        artifact.bindingDigest === SOURCE_ARTIFACTS.calendar.bindingDigest
      ),
    )!.checkpointDigest = checkpoint.checkpointId;
    assert.throws(
      () => buildTaskMapRefreshPlan(truncated),
      /checkpoint.*digest|digest.*checkpoint|64/i,
    );
  });
});
