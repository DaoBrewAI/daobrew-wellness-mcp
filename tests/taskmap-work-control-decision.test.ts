import assert from "node:assert";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  buildTaskMapProjection,
  taskMapSemanticInputDigest,
} from "../src/engine/taskmap/harness.js";
import {
  TASKMAP_IDENTITY_DEDUPE_DIFF_VERSION,
  TASKMAP_IDENTITY_DEDUPE_POLICY_VERSION,
  TASKMAP_IDENTITY_DEDUPE_PROJECTION_VERSION,
  TASKMAP_IDENTITY_DEDUPE_REPLAY_CLOSURE_VERSION,
  TASKMAP_IDENTITY_DEDUPE_STORE_ENTRY_VERSION,
  buildAndPublishTaskMapIdentityDedupeProjection,
  initializeTaskMapIdentityDedupeProjectionStore,
  taskMapIdentityDedupeReplayClosureDigest,
  type TaskMapAdjudicatedLifecycleState,
  type TaskMapIdentityDedupeProjectionStoreEntryV1,
  type TaskMapIdentityDedupeStoreSnapshotV1,
} from "../src/engine/taskmap/identity-dedupe-projection.js";
import {
  advanceTaskMapConnectorCheckpoint,
  buildTaskMapSourceEnvelope,
  buildTaskMapSourceSnapshot,
  diffTaskMapProjections,
  taskMapContractDigest,
} from "../src/engine/taskmap/source-contracts.js";
import {
  TASKMAP_REFRESH_LANE_VERSION,
  TASKMAP_REFRESH_PLAN_DRAFT_VERSION,
  TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION,
  buildTaskMapRefreshPlan,
  selectTaskMapReadyBatch,
  type TaskMapRefreshPlanDraftV1,
} from "../src/engine/taskmap/refresh-plan.js";
import {
  buildTaskMapRefreshRunSourceSliceProof,
  materializeTaskMapRefreshRunBundle,
  prepareTaskMapRefreshRunBundle,
  type PreparedTaskMapRefreshRunBundle,
} from "../src/engine/taskmap/refresh-run-bundle.js";
import {
  initializeTaskMapRefreshCurrentStore,
  publishTaskMapRefreshRunCurrent,
} from "../src/engine/taskmap/refresh-current-ref.js";
import {
  TASKMAP_WORK_CONTROL_CANDIDATE_COVERAGE,
  TASKMAP_WORK_CONTROL_DECISION_VERSION,
  TASKMAP_WORK_CONTROL_LIMITS_V1,
  TASKMAP_WORK_CONTROL_POLICY_VERSION,
  assertTaskMapWorkControlDecision,
  rankAcceptedOpenProjectionTasks,
  taskMapWorkControlDecisionCanonicalBytes,
  unsafeBuildTaskMapWorkControlDecisionFromAuthenticatedP10_2ForTest,
  unsafeBuildTaskMapWorkControlDecisionWithAfterFirstAuthenticatedReadForTest,
  unsafeExerciseTaskMapWorkControlRootReceiptForTest,
  unsafeSelectedTaskMapWorkControlEntryIdForTest,
  type BuiltTaskMapWorkControlDecision,
  type TaskMapWorkControlDecisionV1,
} from "../src/engine/taskmap/work-control-decision.js";
import {
  TASKMAP_CONTRACT_VERSION,
  type BrainRelation,
  type SemanticBrainOutput,
  type TaskMapInput,
  type TaskMapProjectionV1,
  type TaskMapScoreBreakdown,
  type TaskMapSourceAuthorityBindingV1,
  type TaskMapSourceSnapshotV1,
} from "../src/engine/taskmap/types.js";

const GENERATED_AT = "2026-07-28T12:00:00.000Z";
const GENERATION = "00000000000000000001";
const TITLE_LIKE_REJECTION_PROPOSAL_ID = "Update-Design-System";
const digest = (label: string): string =>
  taskMapContractDigest(`p10.3a-test:${label}`);
const OWNER_SCOPE_DIGEST = digest("owner");

type RelationDraft = {
  from: "alpha" | "beta" | "gamma" | "root";
  to: "alpha" | "beta" | "gamma" | "root";
  relation: BrainRelation;
  label: string;
};

const ZERO_SCORE: TaskMapScoreBreakdown = {
  sourcePriority: 0,
  deadlinePressure: 0,
  dependencyImpact: 0,
  recurrence: 0,
  staleOpen: 0,
  evidenceStrength: 0,
  bodyBonus: 0,
  total: 0,
};

const ALPHA_SCORE: TaskMapScoreBreakdown = {
  sourcePriority: 0.8,
  deadlinePressure: 0.6,
  dependencyImpact: 0.99,
  recurrence: 0.4,
  staleOpen: 0.2,
  evidenceStrength: 0.9,
  bodyBonus: 0.03,
  total: 0.01,
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function coordinatedRehash(
  artifact: TaskMapWorkControlDecisionV1,
): TaskMapWorkControlDecisionV1 {
  const {
    artifactId: _artifactId,
    artifactDigest: _artifactDigest,
    ...core
  } = artifact;
  const artifactDigest = taskMapContractDigest(core);
  return {
    ...artifact,
    artifactId: `tmworkcontroldecision_${artifactDigest}`,
    artifactDigest,
  };
}

function projectionFixture(
  relations: RelationDraft[] = [{
    from: "alpha",
    to: "beta",
    relation: "blocks",
    label: "alpha-blocks-beta",
  }],
): TaskMapProjectionV1 {
  const labels = ["alpha", "beta", "gamma"] as const;
  const input: TaskMapInput = {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    generatedAt: GENERATED_AT,
    pointers: labels.map((label, index) => ({
      id: `linear-${label}`,
      sourceKind: "linear",
      sourceObjectId: `synthetic-${label}`,
      sourceRefHash: `${index + 1}`.repeat(16),
      sourceVersion: "synthetic-v1",
      authority: "source_system",
      syncMode: "reference_only",
      capabilities: ["read_task"],
    })),
    events: labels.map((label, index) => ({
      id: `event-${label}`,
      pointerId: `linear-${label}`,
      recordKind: "authoritative_task",
      activity: "task_created",
      occurredAt: `2026-07-28T0${index + 1}:00:00.000Z`,
      observedAt: GENERATED_AT,
      objectRefs: [`work:${label}`],
      title: `Work ${label}`,
      summary: `Synthetic ${label} work.`,
      extractionConfidence: 1,
      sourceStatus: "in_progress",
      priority: 1,
    })),
  };
  const brain: SemanticBrainOutput = {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    provider: "synthetic-brain",
    model: "synthetic-model",
    promptHash: "aaaaaaaaaaaaaaaa",
    inputDigest: taskMapSemanticInputDigest(input),
    generatedAt: GENERATED_AT,
    roots: [{
      proposalId: "root",
      title: "Synthetic root",
      summary: "Synthetic work-control root.",
      evidenceEventIds: labels.map((label) => `event-${label}`),
      memberObjectRefs: labels.map((label) => `work:${label}`),
      confidence: 1,
    }],
    tasks: labels.map((label) => ({
      proposalId: label,
      rootProposalId: "root",
      title: `Work ${label}`,
      summary: `Synthetic ${label} work.`,
      evidenceEventIds: [`event-${label}`],
      authoritativeTaskEventId: `event-${label}`,
      openState: "open",
      confidence: 1,
    })),
    edges: [
      ...labels.map((label) => ({
        proposalId: `edge-root-${label}`,
        fromProposalId: "root",
        toProposalId: label,
        relation: "advances" as const,
        evidenceEventIds: [`event-${label}`],
        confidence: 1,
      })),
    ],
  };
  const projection = clone(buildTaskMapProjection(input, brain, {
    arm: "E4",
    now: GENERATED_AT,
  }));
  for (const task of projection.tasks) {
    task.score = task.title === "Work alpha"
      ? { ...ALPHA_SCORE }
      : { ...ZERO_SCORE };
  }
  const proposalNodeId = (
    proposalId: RelationDraft["from"] | RelationDraft["to"],
  ): string => (
    proposalId === "root"
      ? projection.roots[0]!.id
      : taskId(projection, proposalId)
  );
  projection.edges.push(...relations.map((relation) => ({
    id: `tme_${digest(`edge:${relation.label}`).slice(0, 16)}`,
    from: proposalNodeId(relation.from),
    to: proposalNodeId(relation.to),
    relation: relation.relation,
    citations: [],
  })));
  return projection;
}

function taskId(
  projection: TaskMapProjectionV1,
  label: "alpha" | "beta" | "gamma",
): string {
  const task = projection.tasks.find((row) => (
    row.title === `Work ${label}`
  ));
  assert.ok(task);
  return task.id;
}

function workId(label: string): string {
  return `tmwork_${digest(`work:${label}`)}`;
}

function projectionWithTaskRejectionFixture(): TaskMapProjectionV1 {
  const projection = projectionFixture([]);
  const rejectedTask = taskId(projection, "gamma");
  projection.tasks = projection.tasks.filter((task) => (
    task.id !== rejectedTask
  ));
  projection.roots = projection.roots.map((root) => ({
    ...root,
    taskIds: root.taskIds.filter((id) => id !== rejectedTask),
  }));
  projection.edges = projection.edges.filter((edge) => (
    edge.from !== rejectedTask && edge.to !== rejectedTask
  ));
  projection.rejections.push({
    proposalId: TITLE_LIKE_REJECTION_PROPOSAL_ID,
    kind: "task",
    reasons: ["synthetic task rejection"],
  });
  return projection;
}

type WorkGroup = {
  label: string;
  taskIds?: string[];
  rejectionIds?: string[];
  lifecycle?: TaskMapAdjudicatedLifecycleState;
};

function authenticatedFixture(
  projection: TaskMapProjectionV1,
  groups: WorkGroup[] = projection.tasks.map((task) => ({
    label: task.id,
    taskIds: [task.id],
    lifecycle: "open",
  })),
): {
  entry: TaskMapIdentityDedupeProjectionStoreEntryV1;
  store: TaskMapIdentityDedupeStoreSnapshotV1;
} {
  const projectionDigest =
    diffTaskMapProjections(null, projection).currentProjectionDigest;
  const currentRefId = `tmrefreshcurrent_${digest("current-ref")}`;
  const acceptedOriginBundleId = `tmrefreshrun_${digest("bundle")}`;
  const replayClosure = {
    contractVersion: TASKMAP_IDENTITY_DEDUPE_REPLAY_CLOSURE_VERSION,
    ownerScopeDigest: OWNER_SCOPE_DIGEST,
    sourceSnapshotDigest: digest("source-snapshot"),
    sourceSemanticInputDigest: digest("filtered-semantic-input"),
    projectionDigest,
    projectionRunId: projection.runId,
    projectionInputDigest: projection.inputDigest,
    suppliedIdentityProofDigest: digest("supplied-identity-proof"),
    semanticRowsDigest: digest("semantic-rows"),
  } as const;
  const replayClosureDigest = taskMapContractDigest(replayClosure);
  const works = groups.map((group) => {
    const taskRows = (group.taskIds ?? []).map((id) => {
      const task = projection.tasks.find((row) => row.id === id);
      assert.ok(task);
      const projectionRowDigest = taskMapContractDigest(task);
      return {
        kind: "task" as const,
        id: `tmprojectionref_${taskMapContractDigest({
          kind: "task",
          projectionRowDigest,
        })}`,
        projectionRowDigest,
      };
    });
    const rejectionRows = (group.rejectionIds ?? []).map((id) => {
      const rejection = projection.rejections.find((row) => (
        row.kind === "task" && row.proposalId === id
      ));
      assert.ok(rejection);
      const projectionRowDigest = taskMapContractDigest(rejection);
      return {
        kind: "rejection" as const,
        id: `tmprojectionref_${taskMapContractDigest({
          kind: "rejection",
          projectionRowDigest,
        })}`,
        projectionRowDigest,
      };
    });
    const id = workId(group.label);
    return {
      workId: id,
      canonicalSourceObjectKeyDigest: digest(`canonical:${group.label}`),
      variantSourceObjectKeyDigests: [digest(`canonical:${group.label}`)],
      variantSourceIdentityDigests: [digest(`identity:${group.label}`)],
      projectionReferences: [...taskRows, ...rejectionRows].sort(
        (left, right) => (
          left.kind < right.kind ? -1
            : left.kind > right.kind ? 1
              : left.id < right.id ? -1
                : left.id > right.id ? 1
                  : 0
        ),
      ),
      corroboratingSessionEventIds: [],
      lifecycleEventId: `tmlifecycleevent_${digest(`event:${group.label}`)}`,
      lifecycleState: group.lifecycle ?? "open",
    };
  }).sort((left, right) => (
    left.workId < right.workId ? -1 : left.workId > right.workId ? 1 : 0
  ));
  const sidecarId =
    `tmidentityprojection_${digest(`sidecar:${projectionDigest}`)}`;
  const sidecar: TaskMapIdentityDedupeProjectionStoreEntryV1["sidecar"] = {
    contractVersion: TASKMAP_IDENTITY_DEDUPE_PROJECTION_VERSION,
    sidecarId,
    ownerScopeDigest: OWNER_SCOPE_DIGEST,
    policyVersion: TASKMAP_IDENTITY_DEDUPE_POLICY_VERSION,
    suppliedIdentityProofDigest: replayClosure.suppliedIdentityProofDigest,
    sourceSnapshotId: `tmsnapshot_${digest("source-snapshot").slice(0, 16)}`,
    sourceSnapshotDigest: replayClosure.sourceSnapshotDigest,
    projectionRunId: projection.runId,
    projectionDigest,
    origin: {
      currentRefId,
      currentGeneration: GENERATION,
      acceptedOriginGeneration: GENERATION,
      acceptedStateDigest: digest("accepted-state"),
      bundleId: acceptedOriginBundleId,
      planId: `tmrefreshplan_${digest("plan")}`,
      batchId: `tmrefreshbatch_${digest("batch")}`,
      sourceSnapshotProofId:
        `tmrefreshsnapshotproof_${digest("source-snapshot-proof")}`,
      acceptedOriginReplayDigest: digest("accepted-origin-replay"),
      replayClosureDigest,
    },
    replayClosure,
    works,
    events: [],
    lifecycleDeltas: [],
    rejectedVariants: [],
    privacy: {
      sourceBodiesStored: false,
      emailBodiesStored: false,
      participantDetailsStored: false,
      rawSourceObjectIdentifiersStored: false,
      rawSourceRevisionsStored: false,
      rawBiometricsStored: false,
      fullAgentSessionBodiesStored: false,
      localPathsStored: false,
      connectorSecretsStored: false,
    },
  };
  const sidecarDigest = taskMapContractDigest(sidecar);
  const diff: TaskMapIdentityDedupeProjectionStoreEntryV1["diff"] = {
    contractVersion: TASKMAP_IDENTITY_DEDUPE_DIFF_VERSION,
    diffId: `tmidentitydiff_${digest("diff")}`,
    previousSidecarDigest: taskMapContractDigest(null),
    currentSidecarDigest: sidecarDigest,
    added: [],
    removed: [],
    changed: [],
  };
  const entry = {
    contractVersion: TASKMAP_IDENTITY_DEDUPE_STORE_ENTRY_VERSION,
    entryId: `tmidentityentry_${digest(`entry:${sidecarDigest}`)}`,
    entryKind: "projection",
    ownerScopeDigest: OWNER_SCOPE_DIGEST,
    generation: GENERATION,
    currentRefId,
    currentRefDigest: digest("current-ref-bytes"),
    predecessor: null,
    semanticHead: {
      generation: GENERATION,
      currentRefId,
      sidecarId,
      sidecarDigest,
    },
    acceptedOriginBundleId,
    acceptedOriginReplayDigest:
      sidecar.origin.acceptedOriginReplayDigest,
    replayClosureDigest,
    sidecarId,
    sidecarDigest,
    diffId: diff.diffId,
    diffDigest: taskMapContractDigest(diff),
    sidecar,
    diff,
    privacy: {
      sourceBodiesStored: false,
      rawOwnerIdentifiersStored: false,
      rawSourceObjectIdentifiersStored: false,
      connectorSecretsStored: false,
      localPathsStored: false,
    },
  } as TaskMapIdentityDedupeProjectionStoreEntryV1;
  return {
    entry,
    store: {
      entries: [entry],
      canonicalByteLength: Buffer.byteLength(JSON.stringify(entry), "utf8"),
      remainingByteCapacity: 1,
    },
  };
}

function refreshEntryDigest(
  entry: TaskMapIdentityDedupeProjectionStoreEntryV1,
): void {
  entry.sidecarDigest = taskMapContractDigest(entry.sidecar);
  entry.semanticHead = {
    generation: entry.generation,
    currentRefId: entry.currentRefId,
    sidecarId: entry.sidecarId,
    sidecarDigest: entry.sidecarDigest,
  };
}

function build(
  projection: TaskMapProjectionV1,
  fixture = authenticatedFixture(projection),
): BuiltTaskMapWorkControlDecision {
  return unsafeBuildTaskMapWorkControlDecisionFromAuthenticatedP10_2ForTest({
    firstStore: fixture.store,
    secondStore: fixture.store,
    projection,
  });
}

function relationId(
  projection: TaskMapProjectionV1,
  relation: BrainRelation,
): string {
  const edge = projection.edges.find((row) => row.relation === relation);
  assert.ok(edge);
  return edge.id;
}

function realPolicyBindings(): TaskMapRefreshPlanDraftV1["policyBindings"] {
  return [
    "identity",
    "normalization",
    "publication",
    "scheduling",
    "source",
  ].map((name) => ({
    name: `${name}-policy` as TaskMapRefreshPlanDraftV1[
      "policyBindings"
    ][number]["name"],
    version: `${name}-policy.1`,
    digest: digest(`real-policy:${name}`),
  }));
}

function realRefreshLanes(
  bindingDigest: string,
): TaskMapRefreshPlanDraftV1["lanes"] {
  const lane = (
    value: Omit<
      TaskMapRefreshPlanDraftV1["lanes"][number],
      "contractVersion"
    >,
  ): TaskMapRefreshPlanDraftV1["lanes"][number] => ({
    contractVersion: TASKMAP_REFRESH_LANE_VERSION,
    ...value,
  });
  return [
    lane({
      laneId: "collect-0",
      goal: "provider_collect",
      operationVersion: "linear-collect.1",
      priority: "P0",
      priorityReasonCodes: ["source_freshness"],
      predecessorLaneIds: [],
      resourceClaims: [{
        resourceId: "provider:linear:0",
        mode: "shared",
      }],
      effect: "read_only",
      requiredForPublication: true,
      inputDigests: [bindingDigest],
      outputKinds: ["connector_checkpoint", "source_slice"],
    }),
    lane({
      laneId: "normalize-0",
      goal: "source_normalize",
      operationVersion: "linear-normalize.1",
      priority: "P0",
      priorityReasonCodes: ["identity_integrity"],
      predecessorLaneIds: ["collect-0"],
      resourceClaims: [{
        resourceId: "normalization:linear:0",
        mode: "shared",
      }],
      effect: "local_state",
      requiredForPublication: true,
      inputDigests: [bindingDigest],
      outputKinds: ["normalized_source"],
    }),
    lane({
      laneId: "identity",
      goal: "identity_dedupe_barrier",
      operationVersion: "identity.2",
      priority: "P0",
      priorityReasonCodes: ["identity_integrity"],
      predecessorLaneIds: ["normalize-0"],
      resourceClaims: [{
        resourceId: "taskmap:identity",
        mode: "exclusive",
      }],
      effect: "local_state",
      requiredForPublication: true,
      inputDigests: [bindingDigest],
      outputKinds: ["identity_set"],
    }),
    lane({
      laneId: "gate",
      goal: "deterministic_gate",
      operationVersion: "gate.2",
      priority: "P0",
      priorityReasonCodes: ["deterministic_replay"],
      predecessorLaneIds: ["identity"],
      resourceClaims: [{
        resourceId: "taskmap:gates",
        mode: "shared",
      }],
      effect: "local_state",
      requiredForPublication: true,
      inputDigests: [digest("real-gate-input")],
      outputKinds: ["gate_decision"],
    }),
    lane({
      laneId: "projection",
      goal: "taskmap_projection",
      operationVersion: "projection.2",
      priority: "P0",
      priorityReasonCodes: ["publication_safety"],
      predecessorLaneIds: ["gate"],
      resourceClaims: [{
        resourceId: "taskmap:projection",
        mode: "exclusive",
      }],
      effect: "local_state",
      requiredForPublication: true,
      inputDigests: [digest("real-projection-input")],
      outputKinds: ["taskmap_projection"],
    }),
    lane({
      laneId: "publication",
      goal: "publication",
      operationVersion: "publication.2",
      priority: "P0",
      priorityReasonCodes: ["publication_safety"],
      predecessorLaneIds: ["projection"],
      resourceClaims: [{
        resourceId: "taskmap:accepted-head",
        mode: "exclusive",
      }],
      effect: "local_state",
      requiredForPublication: true,
      inputDigests: [digest("real-publication-input")],
      outputKinds: ["accepted_state"],
    }),
  ];
}

function realSourceFixture(projection: TaskMapProjectionV1): {
  snapshot: TaskMapSourceSnapshotV1;
  binding: TaskMapSourceAuthorityBindingV1;
  workBindings: Array<{
    projectionKind: "task";
    projectionId: string;
    sourceEnvelopeId: string;
  }>;
  lifecycleAdjudications: Array<{
    canonicalSourceObjectKeyDigest: string;
    previousState: "absent";
    currentState: "open";
    currentSourceIdentityDigest: string;
    adjudicatedDelta: "open";
  }>;
} {
  const binding: TaskMapSourceAuthorityBindingV1 = {
    connectionId: "synthetic-p103a-linear",
    sourceKind: "linear",
    tenantOrWorkspaceDigest: digest("real-workspace"),
    accountOrPrincipalDigest: digest("real-principal"),
    grantVersion: "synthetic-read-v1",
  };
  const envelopes = projection.tasks.map((task, index) => (
    buildTaskMapSourceEnvelope({
      ownerScopeDigest: OWNER_SCOPE_DIGEST,
      binding,
      sourceKind: "linear",
      objectType: "authoritative_task",
      sourceObjectId: `synthetic-work-${index}`,
      sourceRevision: "synthetic-v1",
      eventTime: GENERATED_AT,
      contentDigest: digest(`real-content:${task.id}`),
      authority: {
        evidence: "authoritative_task",
        quality: "source_native",
        lifecycle: "source_status",
        completion: "source_status",
        rank: "accepted_work",
      },
    })
  ));
  return {
    snapshot: buildTaskMapSourceSnapshot(envelopes, []),
    binding,
    workBindings: projection.tasks.map((task, index) => ({
      projectionKind: "task",
      projectionId: task.id,
      sourceEnvelopeId: envelopes[index]!.envelopeId,
    })),
    lifecycleAdjudications: envelopes.map((envelope) => ({
      canonicalSourceObjectKeyDigest: envelope.sourceObjectKeyDigest,
      previousState: "absent",
      currentState: "open",
      currentSourceIdentityDigest: envelope.sourceIdentityDigest,
      adjudicatedDelta: "open",
    })),
  };
}

function prepareRealAcceptedOrigin(
  projection: TaskMapProjectionV1,
  source: ReturnType<typeof realSourceFixture>,
): PreparedTaskMapRefreshRunBundle {
  const bindingDigest = taskMapContractDigest(source.binding);
  const sourceRevisions = source.snapshot.envelopes.map((envelope) => ({
    bindingDigest,
    sourceIdentityDigest: envelope.sourceIdentityDigest,
    sourceRevisionDigest: taskMapContractDigest(envelope.sourceRevision),
    contentDigest: envelope.contentDigest,
  })).sort((left, right) => (
    left.sourceIdentityDigest.localeCompare(right.sourceIdentityDigest)
  ));
  const reviewAttestationDigest = digest("real-review-attestation");
  const deterministicReplayDigest =
    taskMapIdentityDedupeReplayClosureDigest(
      source.snapshot,
      projection,
      {
        aliases: [],
        workBindings: source.workBindings,
        sessionLineage: [],
        lifecycleAdjudications: source.lifecycleAdjudications,
      },
      reviewAttestationDigest,
    );
  const draft: TaskMapRefreshPlanDraftV1 = {
    contractVersion: TASKMAP_REFRESH_PLAN_DRAFT_VERSION,
    ownerScopeDigest: OWNER_SCOPE_DIGEST,
    baseline: {
      kind: "genesis",
      priorCheckpointDigests: [],
      priorSourceSliceDigests: [],
      priorProviderArtifacts: [],
      acceptedSourceRevisions: [],
      acceptedSourceRevisionSets: [],
      acceptedSemanticInputDigests: [],
    },
    reviewedDigests: {
      truthSetDigest: digest("real-truth"),
      reviewBatchDigest: digest("real-review-batch"),
      reviewAttestationVersion:
        TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION,
      reviewAttestationDigest,
      sourceManifestDigest: digest("real-source-manifest"),
    },
    sourceBindings: [{
      bindingDigest,
      sourceKind: "linear",
      sourceContractVersion:
        source.snapshot.envelopes[0]!.contractVersion,
      adapterVersion: "linear-adapter.1",
    }],
    sourceRevisions,
    sourceRevisionSets: [{
      bindingDigest,
      revisionSetDigest: taskMapContractDigest(
        sourceRevisions.map((revision) => ({
          sourceIdentityDigest: revision.sourceIdentityDigest,
          sourceRevisionDigest: revision.sourceRevisionDigest,
          contentDigest: revision.contentDigest,
        })),
      ),
    }],
    semanticInputDigests: [source.snapshot.semanticInputDigest],
    deterministicReplayDigest,
    policyBindings: realPolicyBindings(),
    lanes: realRefreshLanes(bindingDigest),
  };
  const plan = buildTaskMapRefreshPlan(draft);
  const batch = selectTaskMapReadyBatch(plan, {
    maxConcurrency: 4,
    laneStates: plan.lanes.map((lane) => ({
      laneId: lane.laneId,
      status: "succeeded",
    })),
  });
  assert.strictEqual(batch.publication.state, "complete");
  const checkpoint = advanceTaskMapConnectorCheckpoint(null, {
    binding: source.binding,
    sourceKind: "linear",
    adapterVersion: "linear-adapter.1",
    capabilities: ["read_task"],
    state: "success",
    attemptedAt: GENERATED_AT,
    proposedWatermark: {
      kind: "revision",
      valueDigest: digest("real-watermark"),
      observedThrough: GENERATED_AT,
    },
    acceptedSourceIdentityDigests:
      source.snapshot.envelopes
        .map((envelope) => envelope.sourceIdentityDigest)
        .sort(),
  });
  const sourceSlice = buildTaskMapRefreshRunSourceSliceProof({
    ownerScopeDigest: OWNER_SCOPE_DIGEST,
    bindingDigest,
    sourceRevisions,
    acceptedSourceIdentityDigests:
      checkpoint.acceptedSourceIdentityDigests,
  });
  return prepareTaskMapRefreshRunBundle({
    plan,
    batch,
    connectorCheckpoints: [checkpoint],
    attemptOutputs: [{
      laneId: "collect-0",
      checkpointDigest: taskMapContractDigest(checkpoint),
      sourceSliceDigest: sourceSlice.sourceSliceDigest,
    }],
    sourceSliceProofs: [sourceSlice],
    sourceSnapshot: source.snapshot,
  });
}

async function materializeRealProductFixture(
  parent: string,
  projection: TaskMapProjectionV1,
): Promise<{
  currentRoot: string;
  runRoot: string;
  sidecarRoot: string;
  source: ReturnType<typeof realSourceFixture>;
}> {
  const currentRoot = path.join(parent, "current");
  const runRoot = path.join(parent, "run");
  const sidecarRoot = path.join(parent, "sidecar");
  await Promise.all([
    mkdir(currentRoot, { mode: 0o700 }),
    mkdir(runRoot, { mode: 0o700 }),
    mkdir(sidecarRoot, { mode: 0o700 }),
  ]);
  await initializeTaskMapRefreshCurrentStore(currentRoot);
  await initializeTaskMapIdentityDedupeProjectionStore({
    currentRoot,
    runRoot,
    sidecarRoot,
  });
  const source = realSourceFixture(projection);
  const prepared = prepareRealAcceptedOrigin(projection, source);
  await materializeTaskMapRefreshRunBundle(runRoot, prepared);
  await publishTaskMapRefreshRunCurrent({
    currentRoot,
    runRoot,
    bundleId: prepared.bundleId,
    expectedGeneration: "00000000000000000000",
    options: {
      operationToken: "12".repeat(16),
    },
  });
  await buildAndPublishTaskMapIdentityDedupeProjection({
    currentRoot,
    runRoot,
    sidecarRoot,
    sourceSnapshot: source.snapshot,
    projection,
    aliases: [],
    workBindings: source.workBindings,
    sessionLineage: [],
    lifecycleAdjudications: source.lifecycleAdjudications,
  });
  return { currentRoot, runRoot, sidecarRoot, source };
}

describe("P10.3a work-control decision", () => {
  it("pins versions, exact P10.2 origin, and unavailable candidate coverage", () => {
    const projection = projectionFixture();
    const built = build(projection);
    assert.strictEqual(
      TASKMAP_WORK_CONTROL_DECISION_VERSION,
      "taskmap-work-control-decision.v1",
    );
    assert.strictEqual(
      TASKMAP_WORK_CONTROL_POLICY_VERSION,
      "taskmap-work-control-policy.1",
    );
    assert.strictEqual(
      built.artifact.candidateCoverage,
      TASKMAP_WORK_CONTROL_CANDIDATE_COVERAGE,
    );
    assert.deepStrictEqual(built.artifact.reviewNext, []);
    assert.strictEqual(
      built.artifact.predecessor.inputDomainBinding,
      "separate_authenticated_domains",
    );
    assert.notStrictEqual(
      built.artifact.predecessor.sourceSemanticInputDigest,
      built.artifact.predecessor.projectionInputDigest,
    );
    assert.match(built.artifact.originDigest, /^[a-f0-9]{64}$/);
    assert.strictEqual(
      built.canonicalBytes,
      taskMapWorkControlDecisionCanonicalBytes(built.artifact),
    );
  });

  it("normalizes blocks and depends_on into prerequisite-to-dependent DAG edges", () => {
    const projection = projectionFixture([
      {
        from: "alpha",
        to: "beta",
        relation: "blocks",
        label: "alpha-blocks-beta",
      },
      {
        from: "gamma",
        to: "beta",
        relation: "depends_on",
        label: "gamma-depends-beta",
      },
    ]);
    const built = build(projection);
    const alphaWork = built.artifact.workDecisions.find((row) => (
      row.projectionTaskIds.includes(taskId(projection, "alpha"))
    ))!.workId;
    const betaWork = built.artifact.workDecisions.find((row) => (
      row.projectionTaskIds.includes(taskId(projection, "beta"))
    ))!.workId;
    const gammaWork = built.artifact.workDecisions.find((row) => (
      row.projectionTaskIds.includes(taskId(projection, "gamma"))
    ))!.workId;
    assert.ok(built.artifact.executionDependencies.some((row) => (
      row.prerequisiteWorkId === alphaWork
      && row.dependentWorkId === betaWork
    )));
    assert.ok(built.artifact.executionDependencies.some((row) => (
      row.prerequisiteWorkId === betaWork
      && row.dependentWorkId === gammaWork
    )));
  });

  it("ranks accepted-open work in integer basis points and ignores legacy total", () => {
    const firstProjection = projectionFixture();
    const first = build(firstProjection);
    const alphaFirst = first.artifact.rankedAcceptedOpen.find((row) => (
      row.workId === first.artifact.workDecisions.find((work) => (
        work.projectionTaskIds.includes(taskId(firstProjection, "alpha"))
      ))!.workId
    ))!;
    assert.strictEqual(alphaFirst.scoreBasisPoints, 6_000);
    assert.strictEqual(
      alphaFirst.factorBasisPoints.dependencyImpact,
      3_333,
    );
    assert.strictEqual(
      alphaFirst.contributionBasisPoints.dependencyImpact,
      500,
    );
    assert.ok(
      alphaFirst.reasonCodes.includes("body_context_not_causal")
        || alphaFirst.reasonCodes.length === 3,
    );

    const secondProjection = clone(firstProjection);
    secondProjection.tasks.find((task) => (
      task.id === taskId(secondProjection, "alpha")
    ))!.score.total = 0.999999;
    const second = build(secondProjection);
    const alphaSecond = second.artifact.rankedAcceptedOpen.find((row) => (
      row.workId === alphaFirst.workId
    ))!;
    assert.deepStrictEqual(
      {
        scoreBasisPoints: alphaSecond.scoreBasisPoints,
        factorBasisPoints: alphaSecond.factorBasisPoints,
        contributionBasisPoints: alphaSecond.contributionBasisPoints,
        reasonCodes: alphaSecond.reasonCodes,
      },
      {
        scoreBasisPoints: alphaFirst.scoreBasisPoints,
        factorBasisPoints: alphaFirst.factorBasisPoints,
        contributionBasisPoints: alphaFirst.contributionBasisPoints,
        reasonCodes: alphaFirst.reasonCodes,
      },
    );
  });

  it("exposes task-level accepted-open ranking from the exact P10.3 scorer core", () => {
    const projection = projectionFixture();
    const workRanking = build(projection).artifact.rankedAcceptedOpen;
    const taskRanking = rankAcceptedOpenProjectionTasks(projection);

    assert.deepStrictEqual(
      taskRanking.map((row) => ({
        taskId: row.taskId,
        scoreBasisPoints: row.scoreBasisPoints,
        factorBasisPoints: row.factorBasisPoints,
        contributionBasisPoints: row.contributionBasisPoints,
        reasonCodes: row.reasonCodes,
      })),
      workRanking.map((row) => ({
        taskId: row.representativeProjectionTaskId,
        scoreBasisPoints: row.scoreBasisPoints,
        factorBasisPoints: row.factorBasisPoints,
        contributionBasisPoints: row.contributionBasisPoints,
        reasonCodes: row.reasonCodes,
      })),
    );
    assert.deepStrictEqual(
      taskRanking.map((row) => row.rank),
      taskRanking.map((_, index) => index + 1),
    );
  });

  it("chooses one coherent whole-row alias score without Frankenstein maxima", () => {
    const projection = projectionFixture([]);
    const alpha = projection.tasks.find((task) => (
      task.id === taskId(projection, "alpha")
    ))!;
    const beta = projection.tasks.find((task) => (
      task.id === taskId(projection, "beta")
    ))!;
    alpha.score = {
      ...ZERO_SCORE,
      sourcePriority: 1,
      staleOpen: 0.021,
    };
    beta.score = {
      ...ZERO_SCORE,
      deadlinePressure: 1,
      staleOpen: 0.022,
    };
    const fixture = authenticatedFixture(projection, [
      {
        label: "mirrored-work",
        taskIds: [alpha.id, beta.id],
      },
      {
        label: "gamma",
        taskIds: [taskId(projection, "gamma")],
      },
    ]);
    const first = build(projection, fixture);
    const mirroredWork = first.artifact.workDecisions.find((work) => (
      work.projectionTaskIds.includes(alpha.id)
    ))!;
    const rank = first.artifact.rankedAcceptedOpen.find((row) => (
      row.workId === mirroredWork.workId
    ))!;
    assert.strictEqual(rank.scoreBasisPoints, 2_522);
    assert.strictEqual(rank.factorBasisPoints.sourcePriority, 0);
    assert.strictEqual(rank.factorBasisPoints.deadlinePressure, 10_000);
    assert.strictEqual(rank.factorBasisPoints.staleOpen, 220);
    assert.strictEqual(
      rank.representativeProjectionTaskId,
      beta.id,
    );
    assert.strictEqual(
      rank.representativeProjectionRowDigest,
      taskMapContractDigest(beta),
    );
    assert.deepStrictEqual(
      rank.aliasRankProofRows.map((row) => row.taskId),
      [beta.id, alpha.id],
    );

    const losingAliasTamper = clone(first.artifact);
    const tamperedRank = losingAliasTamper.rankedAcceptedOpen.find((row) => (
      row.workId === mirroredWork.workId
    ))!;
    tamperedRank.representativeProjectionTaskId = alpha.id;
    tamperedRank.representativeProjectionRowDigest =
      taskMapContractDigest(alpha);
    assert.throws(
      () => assertTaskMapWorkControlDecision(
        coordinatedRehash(losingAliasTamper),
      ),
      /rank fields do not equal the canonical alias winner/,
    );

    const permuted = clone(projection);
    permuted.tasks.reverse();
    const second = build(permuted, fixture);
    assert.deepStrictEqual(
      second.artifact.rankedAcceptedOpen.find((row) => (
        row.workId === mirroredWork.workId
      )),
      rank,
    );
  });

  it("clamps rank totals and breaks exact ties by code-point work ID", () => {
    const projection = projectionFixture([
      {
        from: "alpha",
        to: "beta",
        relation: "blocks",
        label: "alpha-blocks-beta-for-cap",
      },
      {
        from: "alpha",
        to: "gamma",
        relation: "blocks",
        label: "alpha-blocks-gamma-for-cap",
      },
    ]);
    const delta = clone(
      projection.tasks.find((task) => (
        task.id === taskId(projection, "gamma")
      ))!,
    );
    delta.id = `tmc_${digest("task:delta").slice(0, 16)}`;
    delta.title = "Work delta";
    delta.summary = "Synthetic delta work.";
    projection.tasks.push(delta);
    projection.roots[0]!.taskIds.push(delta.id);
    projection.edges.push({
      id: `tme_${digest("edge:alpha-blocks-delta").slice(0, 16)}`,
      from: taskId(projection, "alpha"),
      to: delta.id,
      relation: "blocks",
      citations: [],
    });
    for (const task of projection.tasks) {
      task.score = {
        sourcePriority: 1,
        deadlinePressure: 1,
        dependencyImpact: 1,
        recurrence: 1,
        staleOpen: 1,
        evidenceStrength: 1,
        bodyBonus: 1,
        total: 0,
      };
    }
    const built = build(projection);
    const alphaWork = built.artifact.workDecisions.find((work) => (
      work.projectionTaskIds.includes(taskId(projection, "alpha"))
    ))!.workId;
    assert.strictEqual(
      built.artifact.rankedAcceptedOpen.find((row) => (
        row.workId === alphaWork
      ))!.scoreBasisPoints,
      10_000,
    );
    assert.ok(built.artifact.rankedAcceptedOpen.every((row) => (
      row.scoreBasisPoints <= 10_000
      && row.factorBasisPoints.bodyBonus === 800
    )));

    const tieProjection = projectionFixture([]);
    for (const task of tieProjection.tasks) task.score = { ...ZERO_SCORE };
    const tied = build(tieProjection);
    assert.deepStrictEqual(
      tied.artifact.rankedAcceptedOpen.map((row) => row.workId),
      [...tied.artifact.rankedAcceptedOpen]
        .map((row) => row.workId)
        .sort(),
    );
  });

  it("keeps supersedes lifecycle-only and ranks lifecycle solely from P10.2", () => {
    const projection = projectionFixture([{
      from: "alpha",
      to: "beta",
      relation: "supersedes",
      label: "alpha-supersedes-beta",
    }]);
    const beta = projection.tasks.find((task) => (
      task.id === taskId(projection, "beta")
    ))!;
    beta.reviewState = "superseded";
    beta.openState = "superseded";
    const fixture = authenticatedFixture(projection, [
      { label: "alpha", taskIds: [taskId(projection, "alpha")] },
      {
        label: "beta",
        taskIds: [taskId(projection, "beta")],
        lifecycle: "superseded",
      },
      { label: "gamma", taskIds: [taskId(projection, "gamma")] },
    ]);
    const built = build(projection, fixture);
    const relation = built.artifact.relationDecisions.find((row) => (
      row.edgeId === relationId(projection, "supersedes")
    ));
    assert.strictEqual(relation?.outcome, "lifecycle_only");
    assert.strictEqual(built.artifact.executionDependencies.length, 0);
    const betaWork = built.artifact.workDecisions.find((row) => (
      row.projectionTaskIds.includes(taskId(projection, "beta"))
    ))!;
    assert.strictEqual(betaWork.lifecycleDecision, "superseded");
    assert.strictEqual(betaWork.rankEligible, false);
    assert.ok(!built.artifact.rankedAcceptedOpen.some((row) => (
      row.workId === betaWork.workId
    )));

    const duplicatePairTamper = clone(built.artifact);
    const lifecycleRelation =
      duplicatePairTamper.relationDecisions.find((row) => (
        row.outcome === "lifecycle_only"
      ));
    assert.ok(lifecycleRelation);
    duplicatePairTamper.relationDecisions.push({
      ...lifecycleRelation,
      edgeId:
        `tme_${digest("duplicate-supersedes-pair").slice(0, 16)}`,
    });
    duplicatePairTamper.relationDecisions.sort((left, right) => (
      left.edgeId < right.edgeId ? -1
        : left.edgeId > right.edgeId ? 1
          : 0
    ));
    assert.throws(
      () => assertTaskMapWorkControlDecision(
        coordinatedRehash(duplicatePairTamper),
      ),
      /duplicate normalized supersedes pair/,
    );
  });

  it("publishes only row-derived P10.2 references for rejected work", () => {
    const projection = projectionWithTaskRejectionFixture();
    const fixture = authenticatedFixture(projection, [
      {
        label: "alpha",
        taskIds: [taskId(projection, "alpha")],
        lifecycle: "open",
      },
      {
        label: "beta",
        taskIds: [taskId(projection, "beta")],
        lifecycle: "open",
      },
      {
        label: "gamma-rejected",
        rejectionIds: [TITLE_LIKE_REJECTION_PROPOSAL_ID],
        lifecycle: "rejected",
      },
    ]);
    const built = build(projection, fixture);
    const rejected = built.artifact.workDecisions.find((work) => (
      work.lifecycleDecision === "rejected"
    ));
    assert.ok(rejected);
    const rejection = projection.rejections.find((row) => (
      row.kind === "task"
      && row.proposalId === TITLE_LIKE_REJECTION_PROPOSAL_ID
    ));
    assert.ok(rejection);
    const projectionRowDigest = taskMapContractDigest(rejection);
    const projectionReferenceId = `tmprojectionref_${
      taskMapContractDigest({
        kind: "rejection",
        projectionRowDigest,
      })
    }`;
    assert.deepEqual(rejected.projectionRejectionRows, [{
      projectionReferenceId,
      projectionRowDigest,
    }]);
    assert.deepEqual(
      rejected.projectionRejectionReferenceIds,
      [projectionReferenceId],
    );
    assert.ok(
      !built.canonicalBytes.includes(TITLE_LIKE_REJECTION_PROPOSAL_ID),
    );

    const rawSlugTamper = clone(built.artifact);
    const rawSlugWork = rawSlugTamper.workDecisions.find((work) => (
      work.lifecycleDecision === "rejected"
    ))!;
    rawSlugWork.projectionRejectionRows[0]!.projectionReferenceId =
      TITLE_LIKE_REJECTION_PROPOSAL_ID;
    rawSlugWork.projectionRejectionReferenceIds[0] =
      TITLE_LIKE_REJECTION_PROPOSAL_ID;
    assert.throws(
      () => assertTaskMapWorkControlDecision(
        coordinatedRehash(rawSlugTamper),
      ),
      /projection rejection reference ID/,
    );

    const digestPairTamper = clone(built.artifact);
    const digestPairWork = digestPairTamper.workDecisions.find((work) => (
      work.lifecycleDecision === "rejected"
    ))!;
    digestPairWork.projectionRejectionRows[0]!.projectionRowDigest =
      digest("substituted-rejection-row");
    assert.throws(
      () => assertTaskMapWorkControlDecision(
        coordinatedRehash(digestPairTamper),
      ),
      /projection rejection reference ID is not row-derived/,
    );

    const mixedDispositionTamper = clone(built.artifact);
    const mixedWork = mixedDispositionTamper.workDecisions.find((work) => (
      work.lifecycleDecision === "accepted_open"
    ))!;
    const mixedRowDigest = digest("mixed-disposition-rejection-row");
    const mixedReferenceId = `tmprojectionref_${
      taskMapContractDigest({
        kind: "rejection",
        projectionRowDigest: mixedRowDigest,
      })
    }`;
    mixedWork.projectionRejectionRows.push({
      projectionReferenceId: mixedReferenceId,
      projectionRowDigest: mixedRowDigest,
    });
    mixedWork.projectionRejectionReferenceIds.push(mixedReferenceId);
    mixedWork.projectionRejectionReferenceIds.sort();
    mixedWork.projectionRowDigests.push(mixedRowDigest);
    mixedWork.projectionRowDigests.sort();
    assert.throws(
      () => assertTaskMapWorkControlDecision(
        coordinatedRehash(mixedDispositionTamper),
      ),
      /lifecycle has inconsistent projection rows/,
    );
  });

  it("caps self-contained artifacts at the authenticated P10.2 work ceiling", () => {
    const oversized = clone(build(projectionFixture([])).artifact);
    oversized.workDecisions = Array.from(
      { length: TASKMAP_WORK_CONTROL_LIMITS_V1.maxWorks + 1 },
      (_, index) => {
        const projectionRowDigest =
          digest(`oversized-rejection-row:${index}`);
        const projectionReferenceId = `tmprojectionref_${
          taskMapContractDigest({
            kind: "rejection",
            projectionRowDigest,
          })
        }`;
        return {
          workId: workId(`oversized-rejected:${index}`),
          lifecycleDecision: "rejected" as const,
          rankEligible: false,
          rootId: null,
          projectionTaskRows: [],
          projectionRejectionRows: [{
            projectionReferenceId,
            projectionRowDigest,
          }],
          projectionTaskIds: [],
          projectionRejectionReferenceIds: [projectionReferenceId],
          projectionRowDigests: [projectionRowDigest],
        };
      },
    ).sort((left, right) => (
      left.workId < right.workId ? -1
        : left.workId > right.workId ? 1
          : 0
    ));
    oversized.relationDecisions = [];
    oversized.executionDependencies = [];
    oversized.rankedAcceptedOpen = [];
    const rehashed = coordinatedRehash(oversized);
    assert.strictEqual(rehashed.workDecisions.length, 2_049);
    assert.ok(
      Buffer.byteLength(JSON.stringify(rehashed), "utf8")
        < TASKMAP_WORK_CONTROL_LIMITS_V1.maxCanonicalArtifactBytes,
    );
    assert.throws(
      () => assertTaskMapWorkControlDecision(rehashed),
      /work decision count exceeds the policy ceiling/,
    );
  });

  it("mirrors the supplied projection row ceilings across canonical works", () => {
    const base = build(projectionFixture([])).artifact;
    const terminalArtifact = (
      kind: "task" | "rejection",
      count: number,
    ): TaskMapWorkControlDecisionV1 => {
      const artifact = clone(base);
      const firstCount = Math.floor(count / 2);
      const partitionCounts = [firstCount, count - firstCount];
      let offset = 0;
      artifact.workDecisions = partitionCounts.map(
        (partitionCount, workIndex) => {
          const firstIndex = offset;
          offset += partitionCount;
          if (kind === "task") {
            const taskRows = Array.from(
              { length: partitionCount },
              (_, localIndex) => {
                const index = firstIndex + localIndex;
                return {
                  taskId:
                    `tmc_${digest(`row-ceiling-task:${index}`).slice(0, 16)}`,
                  projectionRowDigest:
                    digest(`row-ceiling-task-row:${index}`),
                };
              },
            ).sort((left, right) => (
              left.taskId < right.taskId ? -1
                : left.taskId > right.taskId ? 1
                  : left.projectionRowDigest < right.projectionRowDigest
                    ? -1
                    : left.projectionRowDigest > right.projectionRowDigest
                      ? 1
                      : 0
            ));
            return {
              workId: workId(`row-ceiling-task-work:${workIndex}`),
              lifecycleDecision: "source_complete" as const,
              rankEligible: false,
              rootId:
                `tmr_${digest(`row-ceiling-root:${workIndex}`).slice(0, 16)}`,
              projectionTaskRows: taskRows,
              projectionRejectionRows: [],
              projectionTaskIds:
                taskRows.map((row) => row.taskId).sort(),
              projectionRejectionReferenceIds: [],
              projectionRowDigests:
                taskRows.map((row) => row.projectionRowDigest).sort(),
            };
          }
          const rejectionRows = Array.from(
            { length: partitionCount },
            (_, localIndex) => {
              const index = firstIndex + localIndex;
              const projectionRowDigest =
                digest(`row-ceiling-rejection-row:${index}`);
              return {
                projectionReferenceId: `tmprojectionref_${
                  taskMapContractDigest({
                    kind: "rejection",
                    projectionRowDigest,
                  })
                }`,
                projectionRowDigest,
              };
            },
          ).sort((left, right) => (
            left.projectionReferenceId < right.projectionReferenceId
              ? -1
              : left.projectionReferenceId > right.projectionReferenceId
                ? 1
                : left.projectionRowDigest < right.projectionRowDigest
                  ? -1
                  : left.projectionRowDigest > right.projectionRowDigest
                    ? 1
                    : 0
          ));
          return {
            workId: workId(`row-ceiling-rejection-work:${workIndex}`),
            lifecycleDecision: "rejected" as const,
            rankEligible: false,
            rootId: null,
            projectionTaskRows: [],
            projectionRejectionRows: rejectionRows,
            projectionTaskIds: [],
            projectionRejectionReferenceIds:
              rejectionRows.map((row) => (
                row.projectionReferenceId
              )).sort(),
            projectionRowDigests:
              rejectionRows.map((row) => row.projectionRowDigest).sort(),
          };
        },
      ).sort((left, right) => (
        left.workId < right.workId ? -1
          : left.workId > right.workId ? 1
            : 0
      ));
      artifact.relationDecisions = [];
      artifact.executionDependencies = [];
      artifact.rankedAcceptedOpen = [];
      return coordinatedRehash(artifact);
    };

    const boundary = terminalArtifact(
      "task",
      TASKMAP_WORK_CONTROL_LIMITS_V1.maxArrayLength,
    );
    assert.doesNotThrow(() => (
      assertTaskMapWorkControlDecision(boundary)
    ));

    for (const [kind, expected] of [
      ["task", /projection task row count exceeds the policy ceiling/],
      [
        "rejection",
        /projection rejection row count exceeds the policy ceiling/,
      ],
    ] as const) {
      const oversized = terminalArtifact(
        kind,
        TASKMAP_WORK_CONTROL_LIMITS_V1.maxArrayLength + 1,
      );
      assert.strictEqual(
        oversized.workDecisions.reduce(
          (total, work) => total + (
            kind === "task"
              ? work.projectionTaskRows.length
              : work.projectionRejectionRows.length
          ),
          0,
        ),
        8_193,
      );
      assert.ok(
        Buffer.byteLength(JSON.stringify(oversized), "utf8")
          < TASKMAP_WORK_CONTROL_LIMITS_V1.maxCanonicalArtifactBytes,
      );
      assert.throws(
        () => assertTaskMapWorkControlDecision(oversized),
        expected,
      );
    }
  });

  it("rejects no-origin, rollback, and an authenticated head race", () => {
    const projection = projectionFixture();
    const fixture = authenticatedFixture(projection);
    const observation = {
      entries: [{ entryKind: "no_accepted_origin" }],
      canonicalByteLength: 1,
      remainingByteCapacity: 1,
    } as unknown as TaskMapIdentityDedupeStoreSnapshotV1;
    assert.throws(() => (
      unsafeBuildTaskMapWorkControlDecisionFromAuthenticatedP10_2ForTest({
        firstStore: observation,
        secondStore: observation,
        projection,
      })
    ), /not projection/);
    const rollback = {
      entries: [{ entryKind: "rollback_observed" }],
      canonicalByteLength: 1,
      remainingByteCapacity: 1,
    } as unknown as TaskMapIdentityDedupeStoreSnapshotV1;
    assert.throws(() => (
      unsafeBuildTaskMapWorkControlDecisionFromAuthenticatedP10_2ForTest({
        firstStore: rollback,
        secondStore: rollback,
        projection,
      })
    ), /not projection/);

    const raced = clone(fixture.store);
    (raced.entries[0] as TaskMapIdentityDedupeProjectionStoreEntryV1)
      .currentRefDigest = digest("advanced-current-ref");
    assert.throws(() => (
      unsafeBuildTaskMapWorkControlDecisionFromAuthenticatedP10_2ForTest({
        firstStore: fixture.store,
        secondStore: raced,
        projection,
      })
    ), /head advanced/);
  });

  it("rejects projection tuple mismatch, unbound rows, proposed tasks, and terminal mismatch", () => {
    const projection = projectionFixture();
    const fixture = authenticatedFixture(projection);
    const changedProjection = clone(projection);
    changedProjection.generatedAt = "2026-07-28T12:00:00.001Z";
    assert.throws(() => build(changedProjection, fixture), /replay tuple/);

    const missing = authenticatedFixture(projection);
    missing.entry.sidecar.works[0]!.projectionReferences = [];
    refreshEntryDigest(missing.entry);
    assert.throws(() => build(projection, missing), /no projection reference/);

    const proposedProjection = clone(projection);
    proposedProjection.tasks[0]!.reviewState = "proposed";
    const proposed = authenticatedFixture(proposedProjection);
    assert.throws(() => build(proposedProjection, proposed), /proposed/);

    const terminalProjection = clone(projection);
    terminalProjection.tasks[0]!.reviewState = "source_complete";
    terminalProjection.tasks[0]!.openState = "completed";
    const terminal = authenticatedFixture(terminalProjection);
    assert.throws(() => build(terminalProjection, terminal), /unsafe projection/);
  });

  it("rejects dangling, self, duplicate, terminal, and cyclic execution relations", () => {
    const danglingProjection = projectionFixture([]);
    const rootEdge = danglingProjection.edges.find((edge) => (
      edge.relation === "advances"
    ))!;
    rootEdge.relation = "depends_on";
    const danglingFixture = authenticatedFixture(danglingProjection);
    assert.throws(
      () => build(danglingProjection, danglingFixture),
      /dangling/,
    );

    const selfProjection = projectionFixture([{
      from: "alpha",
      to: "beta",
      relation: "blocks",
      label: "alias-self",
    }]);
    const selfFixture = authenticatedFixture(selfProjection, [
      {
        label: "alias",
        taskIds: [
          taskId(selfProjection, "alpha"),
          taskId(selfProjection, "beta"),
        ],
      },
      { label: "gamma", taskIds: [taskId(selfProjection, "gamma")] },
    ]);
    assert.throws(() => build(selfProjection, selfFixture), /self-referential/);

    const duplicateProjection = projectionFixture([
      {
        from: "alpha",
        to: "beta",
        relation: "depends_on",
        label: "alpha-depends-beta",
      },
      {
        from: "beta",
        to: "alpha",
        relation: "blocks",
        label: "beta-blocks-alpha",
      },
    ]);
    assert.throws(
      () => build(duplicateProjection),
      /duplicate execution dependency/,
    );

    const cycleProjection = projectionFixture([
      {
        from: "alpha",
        to: "beta",
        relation: "depends_on",
        label: "alpha-depends-beta",
      },
      {
        from: "beta",
        to: "alpha",
        relation: "depends_on",
        label: "beta-depends-alpha",
      },
    ]);
    assert.throws(() => build(cycleProjection), /contains a cycle/);

    const mixedCycleProjection = projectionFixture([
      {
        from: "alpha",
        to: "beta",
        relation: "depends_on",
        label: "alpha-depends-beta-mixed-cycle",
      },
      {
        from: "alpha",
        to: "beta",
        relation: "blocks",
        label: "alpha-blocks-beta-mixed-cycle",
      },
    ]);
    assert.throws(
      () => build(mixedCycleProjection),
      /contains a cycle/,
    );

    const terminalProjection = projectionFixture([{
      from: "alpha",
      to: "beta",
      relation: "blocks",
      label: "terminal-dependency",
    }]);
    const beta = terminalProjection.tasks.find((task) => (
      task.id === taskId(terminalProjection, "beta")
    ))!;
    beta.reviewState = "source_complete";
    beta.openState = "completed";
    const terminalFixture = authenticatedFixture(terminalProjection, [
      { label: "alpha", taskIds: [taskId(terminalProjection, "alpha")] },
      {
        label: "beta",
        taskIds: [taskId(terminalProjection, "beta")],
        lifecycle: "resolved",
      },
      { label: "gamma", taskIds: [taskId(terminalProjection, "gamma")] },
    ]);
    assert.throws(
      () => build(terminalProjection, terminalFixture),
      /terminal canonical work/,
    );
  });

  it("is deterministic under permitted projection row permutation", () => {
    const projection = projectionFixture();
    const first = build(projection);
    const permuted = clone(projection);
    permuted.tasks.reverse();
    permuted.edges.reverse();
    permuted.roots.reverse();
    const second = build(permuted);
    assert.strictEqual(first.canonicalBytes, second.canonicalBytes);
    assert.strictEqual(
      first.artifact.artifactDigest,
      second.artifact.artifactDigest,
    );
  });

  it("rejects hostile public shapes before getters or proxy traps run", () => {
    const projection = projectionFixture();
    const fixture = authenticatedFixture(projection);
    let getterReads = 0;
    const accessorInput = {
      firstStore: fixture.store,
      secondStore: fixture.store,
      get projection() {
        getterReads += 1;
        return projection;
      },
    };
    assert.throws(() => (
      unsafeBuildTaskMapWorkControlDecisionFromAuthenticatedP10_2ForTest(
        accessorInput,
      )
    ), /data properties/);
    assert.strictEqual(getterReads, 0);

    let proxyTraps = 0;
    const proxyProjection = new Proxy(projection, {
      get() {
        proxyTraps += 1;
        throw new Error("must not run");
      },
      ownKeys() {
        proxyTraps += 1;
        throw new Error("must not run");
      },
    });
    assert.throws(() => (
      unsafeBuildTaskMapWorkControlDecisionFromAuthenticatedP10_2ForTest({
        firstStore: fixture.store,
        secondStore: fixture.store,
        projection: proxyProjection,
      })
    ), /proxy/);
    assert.strictEqual(proxyTraps, 0);
  });

  it("charges escaped JSON bytes before clone and accepts own undefined optionals", () => {
    const projection = projectionFixture();
    const fixture = authenticatedFixture(projection);
    Object.defineProperty(projection.sources[0]!, "canonicalUrl", {
      value: undefined,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    const withUndefined = authenticatedFixture(projection);
    assert.doesNotThrow(() => build(projection, withUndefined));

    const escapedCorpus = Array.from(
      { length: 2_048 },
      () => "\\".repeat(4_096),
    );
    assert.throws(() => (
      unsafeBuildTaskMapWorkControlDecisionFromAuthenticatedP10_2ForTest({
        firstStore: {
          entries: escapedCorpus,
          canonicalByteLength: 0,
          remainingByteCapacity: 0,
        } as unknown as TaskMapIdentityDedupeStoreSnapshotV1,
        secondStore: fixture.store,
        projection,
      })
    ), /pre-clone byte ceiling/);
  });

  it("selects only the latest authenticated entry from logical 64 MiB retained history", () => {
    const projection = projectionFixture();
    const fixture = authenticatedFixture(projection);
    const historicalPayload = {
      padding: [
        "x".repeat(4_096),
        "x".repeat(4_096),
        "x".repeat(4_096),
        "x".repeat(4_096),
      ],
    };
    const logicalHistory = Array.from(
      { length: 4_095 },
      () => historicalPayload,
    );
    const store = {
      entries: [...logicalHistory, fixture.entry],
      canonicalByteLength: 64 * 1024 * 1024,
      remainingByteCapacity: 0,
    } as unknown as TaskMapIdentityDedupeStoreSnapshotV1;
    assert.strictEqual(
      unsafeSelectedTaskMapWorkControlEntryIdForTest(store),
      fixture.entry.entryId,
    );
  });

  it("detects a spanning root replacement through the held directory receipt", async () => {
    const createdBase = await mkdtemp(
      path.join(tmpdir(), "p103a-roots-"),
    );
    const base = await realpath(createdBase);
    const currentRoot = path.join(base, "current");
    const runRoot = path.join(base, "run");
    const sidecarRoot = path.join(base, "sidecar");
    const detachedRoot = path.join(base, "current-detached");
    try {
      await Promise.all([
        mkdir(currentRoot, { mode: 0o700 }),
        mkdir(runRoot, { mode: 0o700 }),
        mkdir(sidecarRoot, { mode: 0o700 }),
      ]);
      await assert.rejects(
        unsafeExerciseTaskMapWorkControlRootReceiptForTest(
          { currentRoot, runRoot, sidecarRoot },
          async () => {
            await rename(currentRoot, detachedRoot);
            await mkdir(currentRoot, { mode: 0o700 });
          },
        ),
        /replaced/,
      );
      await chmod(runRoot, 0o755);
      await assert.rejects(
        unsafeExerciseTaskMapWorkControlRootReceiptForTest(
          { currentRoot, runRoot, sidecarRoot },
          () => undefined,
        ),
        /canonical current-user 0700 directory/,
      );
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("fails the real authenticated product path when a root is replaced between reads", async () => {
    const canonicalTmp = await realpath(tmpdir());
    const parent = await mkdtemp(
      path.join(canonicalTmp, "p103a-product-roots-"),
    );
    await chmod(parent, 0o700);
    const projection = projectionFixture([]);
    const fixture = await materializeRealProductFixture(
      parent,
      projection,
    );
    const detachedSidecar = path.join(parent, "sidecar-detached");
    try {
      await assert.rejects(
        unsafeBuildTaskMapWorkControlDecisionWithAfterFirstAuthenticatedReadForTest(
          {
            currentRoot: fixture.currentRoot,
            runRoot: fixture.runRoot,
            sidecarRoot: fixture.sidecarRoot,
            projection,
          },
          async () => {
            await rename(fixture.sidecarRoot, detachedSidecar);
            await cp(detachedSidecar, fixture.sidecarRoot, {
              recursive: true,
              preserveTimestamps: true,
            });
            await chmod(fixture.sidecarRoot, 0o700);
          },
        ),
        /sidecarRoot was replaced during the spanning root receipt/,
      );
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("rejects symbols, inherited inputs, custom arrays, holes, and named array fields", () => {
    const projection = projectionFixture();
    const fixture = authenticatedFixture(projection);
    const symbolInput = {
      firstStore: fixture.store,
      secondStore: fixture.store,
      projection,
      [Symbol("hidden")]: true,
    };
    assert.throws(() => (
      unsafeBuildTaskMapWorkControlDecisionFromAuthenticatedP10_2ForTest(
        symbolInput as never,
      )
    ), /symbol/);

    const inheritedInput = Object.create({
      firstStore: fixture.store,
      secondStore: fixture.store,
      projection,
    });
    assert.throws(() => (
      unsafeBuildTaskMapWorkControlDecisionFromAuthenticatedP10_2ForTest(
        inheritedInput,
      )
    ), /plain or null prototype/);

    const customArrayProjection = clone(projection);
    Object.setPrototypeOf(
      customArrayProjection.tasks,
      Object.create(Array.prototype),
    );
    assert.throws(
      () => build(customArrayProjection, fixture),
      /intrinsic Array prototype/,
    );

    const holeProjection = clone(projection);
    delete holeProjection.tasks[0];
    assert.throws(
      () => build(holeProjection, fixture),
      /holes or named fields/,
    );

    const namedProjection = clone(projection);
    (namedProjection.tasks as unknown as Record<string, unknown>).extra = true;
    assert.throws(
      () => build(namedProjection, fixture),
      /holes or named fields/,
    );
  });

  it("fails closed if intrinsic prototypes change", () => {
    const projection = projectionFixture();
    const fixture = authenticatedFixture(projection);
    Object.defineProperty(Array.prototype, "__p103a_test__", {
      value: true,
      configurable: true,
    });
    try {
      assert.throws(
        () => build(projection, fixture),
        /Array prototype changed/,
      );
    } finally {
      delete (Array.prototype as unknown as Record<string, unknown>)
        .__p103a_test__;
    }

    for (const [prototype, method, label] of [
      [Set.prototype, "has", "Set"],
      [Map.prototype, "get", "Map"],
      [WeakSet.prototype, "has", "WeakSet"],
    ] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, method)!;
      Object.defineProperty(prototype, method, {
        ...descriptor,
        value: () => false,
      });
      try {
        assert.throws(
          () => build(projection, fixture),
          new RegExp(`${label} prototype changed`),
        );
      } finally {
        Object.defineProperty(prototype, method, descriptor);
      }
    }
  });

  it("rejects canonical or privacy-sensitive artifact tampering", () => {
    const built = build(projectionFixture());
    const scoreTamper = clone(built.artifact);
    scoreTamper.rankedAcceptedOpen[0]!.scoreBasisPoints -= 1;
    assert.throws(
      () => assertTaskMapWorkControlDecision(scoreTamper),
      /canonical alias winner|policy-derived|canonical-core-derived/,
    );

    const privacyTamper = clone(built.artifact) as unknown as
      Record<string, unknown>;
    privacyTamper.title = "raw work title";
    assert.throws(
      () => assertTaskMapWorkControlDecision(
        privacyTamper as unknown as typeof built.artifact,
      ),
      /invalid fields/,
    );

    const semanticTamper = clone(built.artifact);
    const firstRank = semanticTamper.rankedAcceptedOpen[0]!;
    const otherWork = semanticTamper.workDecisions.find((work) => (
      work.workId !== firstRank.workId
      && work.projectionTaskRows.length > 0
    ))!;
    firstRank.representativeProjectionTaskId =
      otherWork.projectionTaskRows[0]!.taskId;
    firstRank.representativeProjectionRowDigest =
      otherWork.projectionTaskRows[0]!.projectionRowDigest;
    assert.throws(
      () => assertTaskMapWorkControlDecision(
        coordinatedRehash(semanticTamper),
      ),
      /canonical alias winner/,
    );
  });
});
