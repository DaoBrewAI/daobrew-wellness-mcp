import assert from "node:assert";
import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
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
  type TaskMapAdjudicatedLifecycleDelta,
  type TaskMapAdjudicatedLifecycleState,
  type TaskMapAdjudicatedPreviousLifecycleState,
  type TaskMapIdentityDedupeProjectionStoreEntryV1,
  type TaskMapIdentityDedupeStoreSnapshotV1,
} from "../src/engine/taskmap/identity-dedupe-projection.js";
import {
  TASKMAP_LIFECYCLE_FACETS_POLICY_VERSION,
  TASKMAP_LIFECYCLE_FACETS_LIMITS_V1,
  TASKMAP_LIFECYCLE_FACETS_VERSION,
  assertTaskMapLifecycleFacets,
  buildTaskMapLifecycleFacets,
  taskMapLifecycleFacetsCanonicalBytes,
  unsafeBuildTaskMapLifecycleFacetsFromAuthenticatedFixturesForTest,
  type BuiltTaskMapLifecycleFacets,
  type TaskMapLifecycleFacetsV1,
} from "../src/engine/taskmap/lifecycle-facets.js";
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
  unsafeBuildTaskMapWorkControlDecisionFromAuthenticatedP10_2ForTest,
  type TaskMapWorkControlDecisionV1,
} from "../src/engine/taskmap/work-control-decision.js";
import {
  TASKMAP_CONTRACT_VERSION,
  type SemanticBrainOutput,
  type TaskMapInput,
  type TaskMapProjectionV1,
  type TaskMapScoreBreakdown,
  type TaskMapSourceAuthorityBindingV1,
  type TaskMapSourceSnapshotV1,
} from "../src/engine/taskmap/types.js";

const GENERATED_AT = "2026-07-28T12:00:00.000Z";
const GENERATION = "00000000000000000001";

const digest = (label: unknown): string =>
  taskMapContractDigest({ domain: "p11.1b-lifecycle-facets-test", label });
const OWNER_SCOPE_DIGEST = digest("owner");

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

type LifecycleCase = {
  label: string;
  previousState: TaskMapAdjudicatedPreviousLifecycleState;
  currentState: TaskMapAdjudicatedLifecycleState;
  adjudicatedDelta: TaskMapAdjudicatedLifecycleDelta;
};

type FacetFixture = {
  projection: TaskMapProjectionV1;
  entry: TaskMapIdentityDedupeProjectionStoreEntryV1;
  store: TaskMapIdentityDedupeStoreSnapshotV1;
  workControl: TaskMapWorkControlDecisionV1;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function workId(label: string): string {
  return `tmwork_${digest(`work:${label}`)}`;
}

function projectionFixture(cases: readonly LifecycleCase[]): TaskMapProjectionV1 {
  const input: TaskMapInput = {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    generatedAt: GENERATED_AT,
    pointers: cases.map((row, index) => ({
      id: `linear-${index}`,
      sourceKind: "linear",
      sourceObjectId: `synthetic-${row.label}`,
      sourceRefHash: digest(`source-ref:${row.label}`).slice(0, 16),
      sourceVersion: "synthetic-v1",
      authority: "source_system",
      syncMode: "reference_only",
      capabilities: ["read_task"],
    })),
    events: cases.map((row, index) => ({
      id: `event-${index}`,
      pointerId: `linear-${index}`,
      recordKind: "authoritative_task",
      activity: "task_created",
      occurredAt: `2026-07-28T${String(index).padStart(2, "0")}:00:00.000Z`,
      observedAt: GENERATED_AT,
      objectRefs: [`work:${row.label}`],
      title: `Work ${row.label}`,
      summary: `Synthetic ${row.label} work.`,
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
      summary: "Synthetic lifecycle-facet root.",
      evidenceEventIds: cases.map((_, index) => `event-${index}`),
      memberObjectRefs: cases.map((row) => `work:${row.label}`),
      confidence: 1,
    }],
    tasks: cases.map((row, index) => ({
      proposalId: row.label,
      rootProposalId: "root",
      title: `Work ${row.label}`,
      summary: `Synthetic ${row.label} work.`,
      evidenceEventIds: [`event-${index}`],
      authoritativeTaskEventId: `event-${index}`,
      openState: "open",
      confidence: 1,
    })),
    edges: [],
  };
  const projection = JSON.parse(JSON.stringify(
    buildTaskMapProjection(input, brain, {
      arm: "E4",
      now: GENERATED_AT,
    }),
  )) as TaskMapProjectionV1;
  for (const row of cases) {
    const task = projection.tasks.find((candidate) => (
      candidate.title === `Work ${row.label}`
    ));
    assert.ok(task);
    if (row.currentState === "resolved") {
      task.reviewState = "source_complete";
      task.openState = "completed";
      task.score = { ...ZERO_SCORE };
      task.whyNow = [];
    } else if (row.currentState === "superseded") {
      task.reviewState = "superseded";
      task.openState = "superseded";
      task.score = { ...ZERO_SCORE };
      task.whyNow = [];
    } else if (row.currentState === "rejected") {
      projection.tasks = projection.tasks.filter(
        (candidate) => candidate.id !== task.id,
      );
      projection.roots[0]!.taskIds = projection.roots[0]!.taskIds.filter(
        (taskId) => taskId !== task.id,
      );
      projection.edges = projection.edges.filter(
        (edge) => edge.from !== task.id && edge.to !== task.id,
      );
      projection.rejections.push({
        proposalId: `Rejected-${row.label}`,
        kind: "task",
        reasons: ["synthetic rejected work"],
      });
    } else {
      task.reviewState = "accepted";
      task.openState = "open";
    }
  }
  return projection;
}

function fixtureFor(
  cases: readonly LifecycleCase[],
  mutate?: (
    entry: TaskMapIdentityDedupeProjectionStoreEntryV1,
    projection: TaskMapProjectionV1,
  ) => void,
): FacetFixture {
  const projection = projectionFixture(cases);
  const projectionDigest =
    diffTaskMapProjections(null, projection).currentProjectionDigest;
  const currentRefId = `tmrefreshcurrent_${digest("current-ref")}`;
  const acceptedOriginBundleId = `tmrefreshrun_${digest("bundle")}`;
  const replayClosure = {
    contractVersion: TASKMAP_IDENTITY_DEDUPE_REPLAY_CLOSURE_VERSION,
    ownerScopeDigest: OWNER_SCOPE_DIGEST,
    sourceSnapshotDigest: digest("source-snapshot"),
    sourceSemanticInputDigest: digest("source-semantic-input"),
    projectionDigest,
    projectionRunId: projection.runId,
    projectionInputDigest: projection.inputDigest,
    suppliedIdentityProofDigest: digest("identity-proof"),
    semanticRowsDigest: digest("semantic-rows"),
  } as const;
  const replayClosureDigest = taskMapContractDigest(replayClosure);
  const works: TaskMapIdentityDedupeProjectionStoreEntryV1[
    "sidecar"
  ]["works"] = [];
  const events: TaskMapIdentityDedupeProjectionStoreEntryV1[
    "sidecar"
  ]["events"] = [];
  const lifecycleDeltas: TaskMapIdentityDedupeProjectionStoreEntryV1[
    "sidecar"
  ]["lifecycleDeltas"] = [];
  for (const row of cases) {
    const id = workId(row.label);
    const currentSourceIdentityDigest = digest(`identity:${row.label}:current`);
    const previousSourceIdentityDigest = row.previousState === "absent"
      ? undefined
      : (
        row.adjudicatedDelta === "updated"
          ? digest(`identity:${row.label}:previous`)
          : currentSourceIdentityDigest
      );
    const adjudicationDigest = digest(`adjudication:${row.label}`);
    const lifecycleEventCore = {
      workId: id,
      sourceIdentityDigest: currentSourceIdentityDigest,
      lifecycleState: row.currentState,
      adjudicationDigest,
    };
    const lifecycleEventId =
      `tmlifecycleevent_${taskMapContractDigest(lifecycleEventCore)}`;
    const projectionReferences: TaskMapIdentityDedupeProjectionStoreEntryV1[
      "sidecar"
    ]["works"][number]["projectionReferences"] = [];
    if (row.currentState === "rejected") {
      const rejection = projection.rejections.find((candidate) => (
        candidate.proposalId === `Rejected-${row.label}`
      ));
      assert.ok(rejection);
      const projectionRowDigest = taskMapContractDigest(rejection);
      projectionReferences.push({
        kind: "rejection",
        id: `tmprojectionref_${taskMapContractDigest({
          kind: "rejection",
          projectionRowDigest,
        })}`,
        projectionRowDigest,
      });
    } else {
      const task = projection.tasks.find((candidate) => (
        candidate.title === `Work ${row.label}`
      ));
      assert.ok(task);
      const projectionRowDigest = taskMapContractDigest(task);
      projectionReferences.push({
        kind: "task",
        id: `tmprojectionref_${taskMapContractDigest({
          kind: "task",
          projectionRowDigest,
        })}`,
        projectionRowDigest,
      });
    }
    works.push({
      workId: id,
      canonicalSourceObjectKeyDigest: digest(`canonical:${row.label}`),
      variantSourceObjectKeyDigests: [digest(`canonical:${row.label}`)],
      variantSourceIdentityDigests: [currentSourceIdentityDigest],
      projectionReferences,
      corroboratingSessionEventIds: [],
      lifecycleEventId,
      lifecycleState: row.currentState,
    });
    events.push({
      eventKind: "work_lifecycle",
      eventId: lifecycleEventId,
      ...lifecycleEventCore,
    });
    const deltaCore = {
      workId: id,
      previousState: row.previousState,
      currentState: row.currentState,
      ...(previousSourceIdentityDigest === undefined
        ? {}
        : { previousSourceIdentityDigest }),
      currentSourceIdentityDigest,
      adjudicatedDelta: row.adjudicatedDelta,
      adjudicationDigest,
      lifecycleEventId,
    };
    lifecycleDeltas.push({
      deltaId: `tmlifecycledelta_${taskMapContractDigest(deltaCore)}`,
      ...deltaCore,
    });
  }
  works.sort((left, right) => compareText(left.workId, right.workId));
  events.sort((left, right) => compareText(left.eventId, right.eventId));
  lifecycleDeltas.sort(
    (left, right) => compareText(left.deltaId, right.deltaId),
  );
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
    events,
    lifecycleDeltas,
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
  const entry: TaskMapIdentityDedupeProjectionStoreEntryV1 = {
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
  };
  if (mutate !== undefined) {
    mutate(entry, projection);
    entry.sidecarDigest = taskMapContractDigest(entry.sidecar);
    entry.semanticHead = {
      generation: entry.generation,
      currentRefId: entry.currentRefId,
      sidecarId: entry.sidecarId,
      sidecarDigest: entry.sidecarDigest,
    };
    entry.diff.currentSidecarDigest = entry.sidecarDigest;
    entry.diffDigest = taskMapContractDigest(entry.diff);
  }
  const store: TaskMapIdentityDedupeStoreSnapshotV1 = {
    entries: [entry],
    canonicalByteLength: Buffer.byteLength(JSON.stringify(entry), "utf8"),
    remainingByteCapacity: 1,
  };
  const workControl =
    unsafeBuildTaskMapWorkControlDecisionFromAuthenticatedP10_2ForTest({
      firstStore: store,
      secondStore: store,
      projection,
    }).artifact;
  return { projection, entry, store, workControl };
}

function build(fixture: FacetFixture): BuiltTaskMapLifecycleFacets {
  return unsafeBuildTaskMapLifecycleFacetsFromAuthenticatedFixturesForTest({
    firstStore: fixture.store,
    secondStore: fixture.store,
    projection: fixture.projection,
    workControl: fixture.workControl,
  });
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${
      Object.keys(value as Record<string, unknown>)
        .sort(compareText)
        .map((key) => (
          `${JSON.stringify(key)}:${
            canonicalJson((value as Record<string, unknown>)[key])
          }`
        ))
        .join(",")
    }}`;
  }
  return JSON.stringify(value) ?? "null";
}

function coordinatedRehash(
  artifact: TaskMapLifecycleFacetsV1,
): TaskMapLifecycleFacetsV1 {
  const {
    artifactId: _artifactId,
    artifactDigest: _artifactDigest,
    ...core
  } = artifact;
  const artifactDigest = createDigest(core);
  return {
    ...artifact,
    artifactId: `tmlifecyclefacets_${artifactDigest}`,
    artifactDigest,
  };
}

function coordinatedRehashWorkControl(
  artifact: TaskMapWorkControlDecisionV1,
): TaskMapWorkControlDecisionV1 {
  artifact.originDigest = taskMapContractDigest(artifact.predecessor);
  const {
    artifactId: _artifactId,
    artifactDigest: _artifactDigest,
    ...core
  } = artifact;
  const artifactDigest = taskMapContractDigest(core);
  artifact.artifactId = `tmworkcontroldecision_${artifactDigest}`;
  artifact.artifactDigest = artifactDigest;
  return artifact;
}

function createDigest(value: unknown): string {
  return taskMapContractDigest(JSON.parse(canonicalJson(value)));
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
    connectionId: "synthetic-p111b-linear",
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
      operationToken: "34".repeat(16),
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
  return { currentRoot, runRoot, sidecarRoot };
}

const HAPPY_CASES: readonly LifecycleCase[] = [
  {
    label: "open-new",
    previousState: "absent",
    currentState: "open",
    adjudicatedDelta: "open",
  },
  {
    label: "resolved",
    previousState: "open",
    currentState: "resolved",
    adjudicatedDelta: "resolved",
  },
  {
    label: "superseded",
    previousState: "resolved",
    currentState: "superseded",
    adjudicatedDelta: "superseded",
  },
  {
    label: "rejected",
    previousState: "absent",
    currentState: "rejected",
    adjudicatedDelta: "rejected",
  },
];

describe("P11.1b lifecycle facets", () => {
  it("builds a canonical mixed lifecycle artifact from P10.2 and P10.3a", () => {
    const fixture = fixtureFor(HAPPY_CASES);
    const built = build(fixture);

    assert.equal(built.artifact.contractVersion, TASKMAP_LIFECYCLE_FACETS_VERSION);
    assert.equal(
      built.artifact.policyVersion,
      TASKMAP_LIFECYCLE_FACETS_POLICY_VERSION,
    );
    assert.equal(built.artifact.rows.length, 4);
    assert.deepEqual(
      new Set(built.artifact.rows.map((row) => row.lifecycle)),
      new Set(["accepted_open", "source_complete", "superseded", "rejected"]),
    );
    assert.equal(
      built.artifact.rows.find((row) => row.change === "new")
        ?.newlyAcceptedOpen,
      true,
    );
    const rejected = built.artifact.rows.find(
      (row) => row.lifecycle === "rejected",
    );
    assert.ok(rejected);
    assert.equal(rejected.rootId, null);
    assert.deepEqual(rejected.projectionTaskIds, []);
    assert.equal(
      built.canonicalBytes,
      taskMapLifecycleFacetsCanonicalBytes(built.artifact),
    );
    assert.ok(Object.isFrozen(built.artifact));
    assert.ok(Object.isFrozen(built.artifact.rows));
  });

  it("replays identical authenticated inputs byte-for-byte with sorted rows", () => {
    const fixture = fixtureFor([...HAPPY_CASES].reverse());
    const first = build(fixture);
    const second = build(clone(fixture));

    assert.equal(first.canonicalBytes, second.canonicalBytes);
    assert.equal(first.artifact.artifactId, second.artifact.artifactId);
    assert.deepEqual(
      first.artifact.rows.map((row) => row.workId),
      [...first.artifact.rows.map((row) => row.workId)].sort(compareText),
    );
  });

  it("builds deterministically through the real authenticated P10.1/P10.2/P10.3a product path", async () => {
    const canonicalTmp = await realpath(tmpdir());
    const parent = await mkdtemp(
      path.join(canonicalTmp, "p111b-product-path-"),
    );
    await chmod(parent, 0o700);
    const projection = projectionFixture([{
      label: "real-open",
      previousState: "absent",
      currentState: "open",
      adjudicatedDelta: "open",
    }]);
    try {
      const roots = await materializeRealProductFixture(parent, projection);
      const first = await buildTaskMapLifecycleFacets({
        ...roots,
        projection,
      });
      const second = await buildTaskMapLifecycleFacets({
        ...roots,
        projection,
      });

      assert.equal(first.canonicalBytes, second.canonicalBytes);
      assert.equal(first.artifact.artifactId, second.artifact.artifactId);
      assert.equal(first.artifact.rows.length, 1);
      assert.equal(first.artifact.rows[0]!.lifecycle, "accepted_open");
      assert.equal(first.artifact.rows[0]!.change, "new");
      assert.equal(first.artifact.rows[0]!.changedSinceLastRefresh, true);
      assert.equal(first.artifact.rows[0]!.newlyAcceptedOpen, true);
      assert.equal(first.artifact.rows[0]!.rankEligible, true);
      assert.match(
        first.artifact.predecessor.currentRefId,
        /^tmrefreshcurrent_[a-f0-9]{64}$/,
      );
      assert.match(
        first.artifact.predecessor.entryId,
        /^tmidentityentry_[a-f0-9]{64}$/,
      );
      assert.match(
        first.artifact.predecessor.workControlArtifactId,
        /^tmworkcontroldecision_[a-f0-9]{64}$/,
      );
      assert.equal(
        first.artifact.originDigest,
        taskMapContractDigest(first.artifact.predecessor),
      );
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("covers every mechanically closed P10.2 lifecycle delta", () => {
    const cases: LifecycleCase[] = [
      { label: "open", previousState: "absent", currentState: "open", adjudicatedDelta: "open" },
      { label: "update-open", previousState: "open", currentState: "open", adjudicatedDelta: "updated" },
      { label: "update-resolved", previousState: "resolved", currentState: "resolved", adjudicatedDelta: "updated" },
      { label: "update-superseded", previousState: "superseded", currentState: "superseded", adjudicatedDelta: "updated" },
      { label: "update-rejected", previousState: "rejected", currentState: "rejected", adjudicatedDelta: "updated" },
      { label: "resolve", previousState: "open", currentState: "resolved", adjudicatedDelta: "resolved" },
      { label: "supersede-open", previousState: "open", currentState: "superseded", adjudicatedDelta: "superseded" },
      { label: "supersede-resolved", previousState: "resolved", currentState: "superseded", adjudicatedDelta: "superseded" },
      { label: "reject-new", previousState: "absent", currentState: "rejected", adjudicatedDelta: "rejected" },
      { label: "reject-open", previousState: "open", currentState: "rejected", adjudicatedDelta: "rejected" },
      { label: "noop-open", previousState: "open", currentState: "open", adjudicatedDelta: "no_op" },
      { label: "noop-resolved", previousState: "resolved", currentState: "resolved", adjudicatedDelta: "no_op" },
      { label: "noop-superseded", previousState: "superseded", currentState: "superseded", adjudicatedDelta: "no_op" },
      { label: "noop-rejected", previousState: "rejected", currentState: "rejected", adjudicatedDelta: "no_op" },
    ];
    const rows = cases.map((lifecycleCase) => (
      build(fixtureFor([lifecycleCase])).artifact.rows[0]!
    ));
    assert.equal(rows.length, cases.length);
    for (const row of rows) {
      assert.equal(
        row.changedSinceLastRefresh,
        row.lifecycleDelta.adjudicatedDelta !== "no_op",
      );
      assert.equal(row.rankEligible, row.lifecycle === "accepted_open");
    }
  });

  it("distinguishes a new accepted-open work from open replay and update", () => {
    const built = build(fixtureFor([
      { label: "new", previousState: "absent", currentState: "open", adjudicatedDelta: "open" },
      { label: "update", previousState: "open", currentState: "open", adjudicatedDelta: "updated" },
      { label: "replay", previousState: "open", currentState: "open", adjudicatedDelta: "no_op" },
    ]));
    const byDelta = new Map(built.artifact.rows.map((row) => [
      row.lifecycleDelta.adjudicatedDelta,
      row,
    ]));
    assert.equal(byDelta.get("open")?.change, "new");
    assert.equal(byDelta.get("open")?.newlyAcceptedOpen, true);
    assert.equal(byDelta.get("updated")?.change, "updated");
    assert.equal(byDelta.get("updated")?.newlyAcceptedOpen, false);
    assert.equal(byDelta.get("no_op")?.change, "unchanged");
    assert.equal(byDelta.get("no_op")?.changedSinceLastRefresh, false);
  });

  it("rejects every non-mechanical lifecycle combination", () => {
    const invalid: LifecycleCase[] = [
      { label: "fake-new", previousState: "open", currentState: "open", adjudicatedDelta: "open" },
      { label: "fake-update", previousState: "open", currentState: "resolved", adjudicatedDelta: "updated" },
      { label: "fake-resolve", previousState: "resolved", currentState: "resolved", adjudicatedDelta: "resolved" },
      { label: "reopen", previousState: "resolved", currentState: "open", adjudicatedDelta: "updated" },
      { label: "fake-noop", previousState: "absent", currentState: "open", adjudicatedDelta: "no_op" },
    ];
    for (const row of invalid) {
      const fixture = fixtureFor([row]);
      assert.throws(() => build(fixture), /lifecycle truth table|reopen/);
    }
  });

  it("rejects stale P10.2 heads and mismatched P10.3a artifacts", () => {
    const fixture = fixtureFor(HAPPY_CASES);
    const secondStore = clone(fixture.store);
    const secondEntry = secondStore.entries[0]!;
    secondEntry.entryId = `tmidentityentry_${digest("advanced-entry")}`;
    assert.throws(
      () => unsafeBuildTaskMapLifecycleFacetsFromAuthenticatedFixturesForTest({
        firstStore: fixture.store,
        secondStore,
        projection: fixture.projection,
        workControl: fixture.workControl,
      }),
      /head advanced/,
    );

    const other = fixtureFor([{
      label: "other",
      previousState: "absent",
      currentState: "open",
      adjudicatedDelta: "open",
    }]);
    assert.throws(
      () => unsafeBuildTaskMapLifecycleFacetsFromAuthenticatedFixturesForTest({
        firstStore: fixture.store,
        secondStore: fixture.store,
        projection: fixture.projection,
        workControl: other.workControl,
      }),
      /predecessor does not match/,
    );
  });

  it("rejects a projection changed beneath the authenticated tuple", () => {
    const fixture = fixtureFor(HAPPY_CASES);
    const projection = clone(fixture.projection);
    projection.tasks[0]!.title = "Coordinated but unauthenticated title";
    assert.throws(
      () => unsafeBuildTaskMapLifecycleFacetsFromAuthenticatedFixturesForTest({
        firstStore: fixture.store,
        secondStore: fixture.store,
        projection,
        workControl: fixture.workControl,
      }),
      /predecessor does not match/,
    );
  });

  it("rejects coordinated P10.3a rehash when its rows drift from P10.2 references", () => {
    const fixture = fixtureFor([
      { label: "first", previousState: "absent", currentState: "open", adjudicatedDelta: "open" },
      { label: "second", previousState: "absent", currentState: "open", adjudicatedDelta: "open" },
    ]);
    const changed = clone(fixture);
    const firstWork = changed.entry.sidecar.works[0]!;
    const secondWork = changed.entry.sidecar.works[1]!;
    assert.equal(firstWork.projectionReferences[0]!.kind, "task");
    assert.equal(secondWork.projectionReferences[0]!.kind, "task");
    firstWork.projectionReferences[0] = clone(
      secondWork.projectionReferences[0]!,
    );
    changed.entry.sidecarDigest = taskMapContractDigest(changed.entry.sidecar);
    changed.entry.semanticHead = {
      generation: changed.entry.generation,
      currentRefId: changed.entry.currentRefId,
      sidecarId: changed.entry.sidecarId,
      sidecarDigest: changed.entry.sidecarDigest,
    };
    changed.entry.diff.currentSidecarDigest = changed.entry.sidecarDigest;
    changed.entry.diffDigest = taskMapContractDigest(changed.entry.diff);
    changed.store.entries = [changed.entry];
    changed.workControl.predecessor.sidecarDigest =
      changed.entry.sidecarDigest;
    coordinatedRehashWorkControl(changed.workControl);

    assert.throws(
      () => build(changed),
      /projection rows\/digests diverge/,
    );
  });

  it("rejects missing and duplicate lifecycle deltas", () => {
    const missing = fixtureFor(HAPPY_CASES, (entry) => {
      entry.sidecar.lifecycleDeltas.pop();
    });
    assert.throws(() => build(missing), /exactly one P10.2 lifecycle delta/);

    const duplicate = fixtureFor(HAPPY_CASES, (entry) => {
      entry.sidecar.lifecycleDeltas.push(
        clone(entry.sidecar.lifecycleDeltas[0]!),
      );
    });
    assert.throws(() => build(duplicate), /duplicate lifecycle deltas/);
  });

  it("rejects duplicate or contradictory projection task/root binding", () => {
    const fixture = fixtureFor(HAPPY_CASES);
    const projection = clone(fixture.projection);
    const firstTaskId = projection.roots[0]!.taskIds[0]!;
    projection.roots[0]!.taskIds.push(firstTaskId);
    assert.throws(
      () => unsafeBuildTaskMapLifecycleFacetsFromAuthenticatedFixturesForTest({
        firstStore: fixture.store,
        secondStore: fixture.store,
        projection,
        workControl: fixture.workControl,
      }),
      /predecessor does not match|repeats a projection task ID|taskIds must be unique/,
    );
  });

  it("rejects candidate/token/route and privacy-field contamination", () => {
    const built = build(fixtureFor(HAPPY_CASES));
    const candidate = clone(built.artifact) as TaskMapLifecycleFacetsV1 & {
      candidateToken: string;
    };
    candidate.candidateToken = digest("candidate-token");
    assert.throws(
      () => assertTaskMapLifecycleFacets(candidate),
      /invalid fields|forbidden/,
    );

    const routed = clone(built.artifact) as TaskMapLifecycleFacetsV1 & {
      route: string;
    };
    routed.route = "codex";
    assert.throws(
      () => assertTaskMapLifecycleFacets(routed),
      /invalid fields|forbidden/,
    );

    const privacy = clone(built.artifact);
    privacy.privacy.candidateTokensStored = true as false;
    assert.throws(
      () => assertTaskMapLifecycleFacets(coordinatedRehash(privacy)),
      /privacy flags/,
    );

    const malformedMembership = clone(built.artifact);
    const rejected = malformedMembership.rows.find((row) => (
      row.lifecycle === "rejected"
    ));
    assert.ok(rejected);
    (rejected as unknown as { projectionTaskIds: string })
      .projectionTaskIds = "";
    assert.throws(
      () => assertTaskMapLifecycleFacets(
        coordinatedRehash(malformedMembership),
      ),
      /projection task IDs must be an array/,
    );
  });

  it("rejects semantic tamper even after coordinated artifact rehash", () => {
    const built = build(fixtureFor(HAPPY_CASES));
    const tampered = clone(built.artifact);
    const row = tampered.rows.find((candidate) => (
      candidate.lifecycleDelta.adjudicatedDelta === "open"
    ));
    assert.ok(row);
    row.change = "updated";
    assert.throws(
      () => assertTaskMapLifecycleFacets(coordinatedRehash(tampered)),
      /derived lifecycle facets/,
    );
  });

  it("rejects one lifecycle delta or event reused across work rows", () => {
    const built = build(fixtureFor([
      { label: "first", previousState: "absent", currentState: "open", adjudicatedDelta: "open" },
      { label: "second", previousState: "absent", currentState: "open", adjudicatedDelta: "open" },
    ]));
    const duplicateDelta = clone(built.artifact);
    duplicateDelta.rows[1]!.lifecycleDelta = clone(
      duplicateDelta.rows[0]!.lifecycleDelta,
    );
    assert.throws(
      () => assertTaskMapLifecycleFacets(
        coordinatedRehash(duplicateDelta),
      ),
      /lifecycle delta IDs are not unique/,
    );

    const duplicateEvent = clone(built.artifact);
    duplicateEvent.rows[1]!.lifecycleDelta.lifecycleEventId =
      duplicateEvent.rows[0]!.lifecycleDelta.lifecycleEventId;
    assert.throws(
      () => assertTaskMapLifecycleFacets(
        coordinatedRehash(duplicateEvent),
      ),
      /lifecycle event IDs are not unique/,
    );
  });

  it("enforces the global projection-task ceiling across all work rows", () => {
    const built = build(fixtureFor([
      { label: "first", previousState: "absent", currentState: "open", adjudicatedDelta: "open" },
      { label: "second", previousState: "absent", currentState: "open", adjudicatedDelta: "open" },
    ]));
    const taskId = (index: number): string => (
      `tmc_${index.toString(16).padStart(16, "0")}`
    );
    const atLimitIds = Array.from(
      { length: TASKMAP_LIFECYCLE_FACETS_LIMITS_V1.maxProjectionTasks },
      (_, index) => taskId(index),
    );
    const atLimit = clone(built.artifact);
    atLimit.rows[0]!.projectionTaskIds = atLimitIds.slice(0, 4_096);
    atLimit.rows[1]!.projectionTaskIds = atLimitIds.slice(4_096);
    assert.doesNotThrow(() => (
      assertTaskMapLifecycleFacets(coordinatedRehash(atLimit))
    ));

    const overLimit = clone(atLimit);
    overLimit.rows[1]!.projectionTaskIds.push(
      taskId(TASKMAP_LIFECYCLE_FACETS_LIMITS_V1.maxProjectionTasks),
    );
    assert.throws(
      () => assertTaskMapLifecycleFacets(coordinatedRehash(overLimit)),
      /global projection-task ceiling/,
    );
  });

  it("rejects proxy, accessor, own undefined, and oversized inputs", () => {
    const fixture = fixtureFor(HAPPY_CASES);
    const proxied = clone(fixture);
    proxied.projection = new Proxy(proxied.projection, {});
    assert.throws(
      () => build(proxied),
      /contains a proxy/,
    );

    const accessor = {
      firstStore: clone(fixture.store),
      secondStore: clone(fixture.store),
      projection: clone(fixture.projection),
      workControl: clone(fixture.workControl),
    } as Parameters<
      typeof unsafeBuildTaskMapLifecycleFacetsFromAuthenticatedFixturesForTest
    >[0] & { unexpected?: string };
    Object.defineProperty(accessor, "unexpected", {
      enumerable: true,
      get: () => "not allowed",
    });
    assert.throws(
      () => unsafeBuildTaskMapLifecycleFacetsFromAuthenticatedFixturesForTest(
        accessor,
      ),
      /enumerable defined JSON data properties/,
    );

    const undefinedField = {
      firstStore: clone(fixture.store),
      secondStore: clone(fixture.store),
      projection: clone(fixture.projection),
      workControl: clone(fixture.workControl),
    } as Parameters<
      typeof unsafeBuildTaskMapLifecycleFacetsFromAuthenticatedFixturesForTest
    >[0] & {
      unexpected?: undefined;
    };
    undefinedField.unexpected = undefined;
    assert.throws(
      () => unsafeBuildTaskMapLifecycleFacetsFromAuthenticatedFixturesForTest(
        undefinedField,
      ),
      /enumerable defined JSON data properties/,
    );

    const oversized = clone(fixture);
    oversized.projection.tasks[0]!.title = "x".repeat(4_097);
    assert.throws(
      () => build(oversized),
      /string ceiling/,
    );
  });
});
