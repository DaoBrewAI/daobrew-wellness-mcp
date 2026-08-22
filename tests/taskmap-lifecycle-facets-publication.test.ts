import assert from "node:assert";
import { createHash } from "node:crypto";
import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  buildTaskMapProjection,
  taskMapSemanticInputDigest,
} from "../src/engine/taskmap/harness.js";
import {
  buildAndPublishTaskMapIdentityDedupeProjection,
  initializeTaskMapIdentityDedupeProjectionStore,
  publishTaskMapIdentityDedupeRollbackObservation,
  taskMapIdentityDedupeReplayClosureDigest,
} from "../src/engine/taskmap/identity-dedupe-projection.js";
import {
  TASKMAP_LIFECYCLE_FACETS_PUBLICATION_VERSION,
  buildAndPublishTaskMapLifecycleFacets,
  initializeTaskMapLifecycleFacetsPublicationStore,
  readTaskMapLifecycleFacetsPublicationStore,
  recoverTaskMapLifecycleFacetsPublicationStore,
  taskMapLifecycleFacetsPublicationCanonicalBytes,
  type TaskMapLifecycleFacetsPublicationV1,
} from "../src/engine/taskmap/lifecycle-facets-publication.js";
import type {
  TaskMapLifecycleFacetsPredecessorV1,
  TaskMapLifecycleFacetsV1,
} from "../src/engine/taskmap/lifecycle-facets.js";
import {
  advanceTaskMapConnectorCheckpoint,
  buildTaskMapSourceEnvelope,
  buildTaskMapSourceSnapshot,
  diffTaskMapProjections,
  taskMapContractCanonicalJson,
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
  readTaskMapRefreshCurrent,
  rollbackTaskMapRefreshCurrent,
} from "../src/engine/taskmap/refresh-current-ref.js";
import {
  TASKMAP_CONTRACT_VERSION,
  type SemanticBrainOutput,
  type TaskMapInput,
  type TaskMapProjectionV1,
  type TaskMapSourceAuthorityBindingV1,
  type TaskMapSourceSnapshotV1,
} from "../src/engine/taskmap/types.js";

const GENERATED_AT = "2026-07-28T12:00:00.000Z";
const FIRST_GENERATION = "00000000000000000001";
const SECOND_GENERATION = "00000000000000000002";
const digest = (label: unknown): string =>
  taskMapContractDigest({
    domain: "p11.1b-2a-lifecycle-publication-test",
    label,
  });
const OWNER_SCOPE_DIGEST = digest("owner");

type ProductRoots = {
  currentRoot: string;
  runRoot: string;
  sidecarRoot: string;
  publicationRoot: string;
};

type ProductFixture = {
  parent: string;
  roots: ProductRoots;
  projection: TaskMapProjectionV1;
};

function projectionFixture(): TaskMapProjectionV1 {
  const input: TaskMapInput = {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    generatedAt: GENERATED_AT,
    pointers: [{
      id: "linear-work",
      sourceKind: "linear",
      sourceObjectId: "synthetic-work",
      sourceRefHash: digest("source-ref").slice(0, 16),
      sourceVersion: "synthetic-v1",
      authority: "source_system",
      syncMode: "reference_only",
      capabilities: ["read_task"],
    }],
    events: [{
      id: "linear-work-open",
      pointerId: "linear-work",
      recordKind: "authoritative_task",
      activity: "task_created",
      occurredAt: GENERATED_AT,
      observedAt: GENERATED_AT,
      objectRefs: ["work:one"],
      title: "Ship the publication capsule",
      summary: "Publish one authenticated lifecycle capsule.",
      extractionConfidence: 1,
      sourceStatus: "in_progress",
      priority: 1,
    }],
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
      title: "Publication",
      summary: "Lifecycle publication workstream.",
      evidenceEventIds: ["linear-work-open"],
      memberObjectRefs: ["work:one"],
      confidence: 1,
    }],
    tasks: [{
      proposalId: "task",
      rootProposalId: "root",
      title: "Ship the publication capsule",
      summary: "Publish one authenticated lifecycle capsule.",
      evidenceEventIds: ["linear-work-open"],
      authoritativeTaskEventId: "linear-work-open",
      openState: "open",
      confidence: 1,
    }],
    edges: [],
  };
  return JSON.parse(JSON.stringify(
    buildTaskMapProjection(input, brain, {
      arm: "E4",
      now: GENERATED_AT,
    }),
  )) as TaskMapProjectionV1;
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
    digest: digest(`policy:${name}`),
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
      resourceClaims: [{ resourceId: "provider:linear:0", mode: "shared" }],
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
      resourceClaims: [{ resourceId: "taskmap:identity", mode: "exclusive" }],
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
      resourceClaims: [{ resourceId: "taskmap:gates", mode: "shared" }],
      effect: "local_state",
      requiredForPublication: true,
      inputDigests: [digest("gate-input")],
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
      inputDigests: [digest("projection-input")],
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
      inputDigests: [digest("publication-input")],
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
    connectionId: "synthetic-p111b-publication-linear",
    sourceKind: "linear",
    tenantOrWorkspaceDigest: digest("workspace"),
    accountOrPrincipalDigest: digest("principal"),
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
      contentDigest: digest(`content:${task.id}`),
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
  const reviewAttestationDigest = digest("review-attestation");
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
      truthSetDigest: digest("truth"),
      reviewBatchDigest: digest("review-batch"),
      reviewAttestationVersion:
        TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION,
      reviewAttestationDigest,
      sourceManifestDigest: digest("source-manifest"),
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
  assert.equal(batch.publication.state, "complete");
  const checkpoint = advanceTaskMapConnectorCheckpoint(null, {
    binding: source.binding,
    sourceKind: "linear",
    adapterVersion: "linear-adapter.1",
    capabilities: ["read_task"],
    state: "success",
    attemptedAt: GENERATED_AT,
    proposedWatermark: {
      kind: "revision",
      valueDigest: digest("watermark"),
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

async function createProductFixture(
  label: string,
): Promise<ProductFixture> {
  const canonicalTmp = await realpath(tmpdir());
  const parent = await mkdtemp(
    path.join(canonicalTmp, `taskmap-p11-publication-${label}-`),
  );
  await chmod(parent, 0o700);
  const roots: ProductRoots = {
    currentRoot: path.join(parent, "current"),
    runRoot: path.join(parent, "run"),
    sidecarRoot: path.join(parent, "sidecar"),
    publicationRoot: path.join(parent, "publication"),
  };
  await Promise.all(
    Object.values(roots).map((root) => mkdir(root, { mode: 0o700 })),
  );
  await initializeTaskMapRefreshCurrentStore(roots.currentRoot);
  await initializeTaskMapIdentityDedupeProjectionStore({
    currentRoot: roots.currentRoot,
    runRoot: roots.runRoot,
    sidecarRoot: roots.sidecarRoot,
  });
  await initializeTaskMapLifecycleFacetsPublicationStore(
    roots.publicationRoot,
  );
  const projection = projectionFixture();
  const source = realSourceFixture(projection);
  const prepared = prepareRealAcceptedOrigin(projection, source);
  await materializeTaskMapRefreshRunBundle(roots.runRoot, prepared);
  await publishTaskMapRefreshRunCurrent({
    currentRoot: roots.currentRoot,
    runRoot: roots.runRoot,
    bundleId: prepared.bundleId,
    expectedGeneration: "00000000000000000000",
    options: { operationToken: "34".repeat(16) },
  });
  await buildAndPublishTaskMapIdentityDedupeProjection({
    currentRoot: roots.currentRoot,
    runRoot: roots.runRoot,
    sidecarRoot: roots.sidecarRoot,
    sourceSnapshot: source.snapshot,
    projection,
    aliases: [],
    workBindings: source.workBindings,
    sessionLineage: [],
    lifecycleAdjudications: source.lifecycleAdjudications,
  });
  return { parent, roots, projection };
}

async function withProductFixture<T>(
  label: string,
  run: (fixture: ProductFixture) => Promise<T>,
): Promise<T> {
  const fixture = await createProductFixture(label);
  try {
    return await run(fixture);
  } finally {
    await rm(fixture.parent, { recursive: true, force: true });
  }
}

async function advanceP10WithRollback(
  roots: ProductRoots,
  tokenByte: string,
): Promise<void> {
  const current = await readTaskMapRefreshCurrent(
    roots.currentRoot,
    roots.runRoot,
  );
  assert.equal(current.head?.generation, FIRST_GENERATION);
  const rolledBack = await rollbackTaskMapRefreshCurrent({
    currentRoot: roots.currentRoot,
    runRoot: roots.runRoot,
    targetGeneration: FIRST_GENERATION,
    expectedGeneration: FIRST_GENERATION,
    expectedRefId: current.head!.refId,
    options: { operationToken: tokenByte.repeat(16) },
  });
  assert.equal(rolledBack.ref.generation, SECOND_GENERATION);
  await publishTaskMapIdentityDedupeRollbackObservation({
    currentRoot: roots.currentRoot,
    runRoot: roots.runRoot,
    sidecarRoot: roots.sidecarRoot,
    targetGeneration: SECOND_GENERATION,
  });
}

function capsulePath(roots: ProductRoots): string {
  return path.join(
    roots.publicationRoot,
    "generations",
    `${FIRST_GENERATION}.publication.json`,
  );
}

function rehashCapsule(
  capsule: TaskMapLifecycleFacetsPublicationV1,
): TaskMapLifecycleFacetsPublicationV1 {
  const {
    publicationId: _publicationId,
    publicationDigest: _publicationDigest,
    ...core
  } = capsule;
  const publicationDigest = taskMapContractDigest(core);
  return {
    ...core,
    publicationId: `tmlifecyclepublication_${publicationDigest}`,
    publicationDigest,
  };
}

function workControlOriginDigest(
  predecessor: TaskMapLifecycleFacetsPredecessorV1,
): string {
  return taskMapContractDigest({
    ownerScopeDigest: predecessor.ownerScopeDigest,
    generation: predecessor.generation,
    currentRefId: predecessor.currentRefId,
    currentRefDigest: predecessor.currentRefDigest,
    entryId: predecessor.entryId,
    acceptedOriginBundleId: predecessor.acceptedOriginBundleId,
    acceptedOriginReplayDigest: predecessor.acceptedOriginReplayDigest,
    acceptedStateDigest: predecessor.acceptedStateDigest,
    sidecarId: predecessor.sidecarId,
    sidecarDigest: predecessor.sidecarDigest,
    replayClosureDigest: predecessor.replayClosureDigest,
    sourceSnapshotDigest: predecessor.sourceSnapshotDigest,
    sourceSemanticInputDigest: predecessor.sourceSemanticInputDigest,
    projectionRunId: predecessor.projectionRunId,
    projectionInputDigest: predecessor.projectionInputDigest,
    projectionDigest: predecessor.projectionDigest,
    inputDomainBinding: "separate_authenticated_domains",
  });
}

function rehashLifecycleArtifact(
  artifact: TaskMapLifecycleFacetsV1,
): TaskMapLifecycleFacetsV1 {
  artifact.originDigest = taskMapContractDigest(artifact.predecessor);
  const {
    artifactId: _artifactId,
    artifactDigest: _artifactDigest,
    ...core
  } = artifact;
  artifact.artifactDigest = taskMapContractDigest(core);
  artifact.artifactId = `tmlifecyclefacets_${artifact.artifactDigest}`;
  return artifact;
}

async function replaceCapsule(
  roots: ProductRoots,
  capsule: TaskMapLifecycleFacetsPublicationV1,
): Promise<void> {
  const target = capsulePath(roots);
  await rm(target);
  await writeFile(target, taskMapContractCanonicalJson(capsule), {
    mode: 0o600,
    flag: "wx",
  });
}

describe("P11.1b-2a lifecycle-facets publication", () => {
  it("publishes and reads one deterministic authenticated capsule with exact retry", async () => {
    await withProductFixture("product", async ({ roots, projection }) => {
      const first = await buildAndPublishTaskMapLifecycleFacets({
        ...roots,
        projection,
      });
      assert.equal(first.publication.status, "published");
      assert.equal(
        first.capsule.contractVersion,
        TASKMAP_LIFECYCLE_FACETS_PUBLICATION_VERSION,
      );
      assert.equal(
        first.projectionCanonicalBytes,
        taskMapContractCanonicalJson(projection),
      );
      assert.equal(
        first.capsule.projectionMember.canonicalBytes,
        first.projectionCanonicalBytes,
      );
      assert.equal(
        first.capsule.lifecycleMember.canonicalBytes,
        first.canonicalBytes,
      );
      assert.equal(
        first.capsuleCanonicalBytes,
        taskMapLifecycleFacetsPublicationCanonicalBytes(first.capsule),
      );
      assert.equal(first.capsule.p10Head.generation, FIRST_GENERATION);
      assert.equal(first.capsule.p10StorePredecessor, null);
      assert.equal(first.capsule.predecessorPublication, null);
      assert.deepEqual(first.capsule.privacy, {
        sourceBodiesStored: false,
        candidateTokensStored: false,
        candidateTextStored: false,
        additionalRouteDataStored: false,
        rawOwnerIdentifiersStored: false,
        rawSourceObjectIdentifiersStored: false,
        rawSourceRevisionsStored: false,
        rawBiometricsStored: false,
        localPathsStored: false,
        connectorSecretsStored: false,
        executionStateStored: false,
      });
      assert.ok(!first.canonicalBytes.includes('"candidateTokensStored":true'));
      assert.ok(!first.canonicalBytes.includes('"candidateTextStored":true'));
      assert.ok(!first.canonicalBytes.includes("returnRoute"));
      assert.ok(!first.capsuleCanonicalBytes.includes("sourceObjectId"));
      assert.ok(!first.capsuleCanonicalBytes.includes("sourceRevision"));
      assert.ok(!first.capsuleCanonicalBytes.includes(roots.currentRoot));

      const read = await readTaskMapLifecycleFacetsPublicationStore(roots);
      assert.equal(read.headStatus, "current");
      assert.equal(read.publications.length, 1);
      assert.equal(
        taskMapLifecycleFacetsPublicationCanonicalBytes(read.publications[0]!),
        first.capsuleCanonicalBytes,
      );
      const retry = await buildAndPublishTaskMapLifecycleFacets({
        ...roots,
        projection: structuredClone(projection),
      });
      assert.equal(retry.publication.status, "already_published");
      assert.equal(retry.capsuleCanonicalBytes, first.capsuleCanonicalBytes);
    });
  });

  it("converges concurrent exact writers and rejects a different valid same-generation CAS", async () => {
    await withProductFixture("concurrent", async ({ roots, projection }) => {
      const [left, right] = await Promise.all([
        buildAndPublishTaskMapLifecycleFacets({ ...roots, projection }),
        buildAndPublishTaskMapLifecycleFacets({
          ...roots,
          projection: structuredClone(projection),
        }),
      ]);
      assert.deepEqual(
        [left.publication.status, right.publication.status].sort(),
        ["already_published", "published"],
      );
      assert.equal(left.capsuleCanonicalBytes, right.capsuleCanonicalBytes);
    });

    const template = await createProductFixture("conflict-template");
    let templateCapsule: TaskMapLifecycleFacetsPublicationV1;
    try {
      templateCapsule = (
        await buildAndPublishTaskMapLifecycleFacets({
          ...template.roots,
          projection: template.projection,
        })
      ).capsule;
    } finally {
      await rm(template.parent, { recursive: true, force: true });
    }
    await withProductFixture("conflict", async ({ roots, projection }) => {
      const conflict = rehashCapsule({
        ...structuredClone(templateCapsule),
        p10StorePredecessor: {
          generation: "00000000000000000000",
          currentRefId: "conflicting-current-ref",
          entryId: "conflicting-entry",
        },
      });
      let inserted = false;
      await assert.rejects(
        buildAndPublishTaskMapLifecycleFacets(
          { ...roots, projection },
          {
            faultInjection: async (point) => {
              if (point !== "before_final_p10_read" || inserted) return;
              inserted = true;
              await writeFile(
                capsulePath(roots),
                taskMapContractCanonicalJson(conflict),
                { mode: 0o600, flag: "wx" },
              );
            },
          },
        ),
        /no-replace CAS conflict/,
      );
      assert.equal(inserted, true);
    });
  });

  it("rejects P10 movement before CAS without committing P11", async () => {
    await withProductFixture("before-cas", async ({ roots, projection }) => {
      let advanced = false;
      await assert.rejects(
        buildAndPublishTaskMapLifecycleFacets(
          { ...roots, projection },
          {
            faultInjection: async (point) => {
              if (point !== "before_final_p10_read" || advanced) return;
              advanced = true;
              await advanceP10WithRollback(roots, "45");
            },
          },
        ),
        /final pre-CAS P10 head/,
      );
      assert.equal(advanced, true);
      const generationNames = await import("node:fs/promises").then(
        ({ readdir }) => readdir(
          path.join(roots.publicationRoot, "generations"),
        ),
      );
      assert.deepEqual(generationNames, []);
    });
  });

  it("returns committed_head_advanced_retry and preserves the historical capsule", async () => {
    await withProductFixture("post-commit", async ({ roots, projection }) => {
      let advanced = false;
      const result = await buildAndPublishTaskMapLifecycleFacets(
        { ...roots, projection },
        {
          faultInjection: async (point) => {
            if (point !== "after_generation_link" || advanced) return;
            advanced = true;
            await advanceP10WithRollback(roots, "56");
          },
        },
      );
      assert.equal(advanced, true);
      assert.equal(
        result.publication.status,
        "committed_head_advanced_retry",
      );
      assert.equal(result.publication.committed, true);
      const read = await readTaskMapLifecycleFacetsPublicationStore(roots);
      assert.equal(read.headStatus, "p10_head_advanced_retry");
      assert.equal(read.publications.length, 1);
      assert.equal(
        read.publications[0]!.publicationId,
        result.capsule.publicationId,
      );
    });
  });

  it("rejects capsule, member, predecessor, and coordinated authority substitution", async () => {
    for (
      const kind of [
        "capsule",
        "member",
        "predecessor",
        "work-control",
        "substitution",
      ] as const
    ) {
      await withProductFixture(`tamper-${kind}`, async ({ roots, projection }) => {
        const published = await buildAndPublishTaskMapLifecycleFacets({
          ...roots,
          projection,
        });
        const tampered = structuredClone(published.capsule);
        if (kind === "capsule") {
          tampered.publicationDigest = "0".repeat(64);
        } else if (kind === "member") {
          const member = JSON.parse(
            tampered.projectionMember.canonicalBytes,
          ) as TaskMapProjectionV1;
          member.tasks[0]!.title = "Coordinated member tamper";
          tampered.projectionMember.canonicalBytes =
            taskMapContractCanonicalJson(member);
          tampered.projectionMember.byteLength = Buffer.byteLength(
            tampered.projectionMember.canonicalBytes,
            "utf8",
          );
          tampered.projectionMember.byteSha256 = createHash("sha256")
            .update(tampered.projectionMember.canonicalBytes)
            .digest("hex");
          Object.assign(tampered, rehashCapsule(tampered));
        } else if (kind === "predecessor") {
          tampered.p10Head.currentRefDigest = digest("tampered-current");
          Object.assign(tampered, rehashCapsule(tampered));
        } else if (kind === "work-control") {
          const substitutedLifecycle = JSON.parse(
            tampered.lifecycleMember.canonicalBytes,
          ) as TaskMapLifecycleFacetsV1;
          substitutedLifecycle.predecessor.workControlArtifactDigest =
            digest("isolated-work-control-substitution");
          substitutedLifecycle.predecessor.workControlArtifactId =
            `tmworkcontroldecision_${
              substitutedLifecycle.predecessor.workControlArtifactDigest
            }`;
          rehashLifecycleArtifact(substitutedLifecycle);
          tampered.lifecycleMember.canonicalBytes =
            taskMapContractCanonicalJson(substitutedLifecycle);
          tampered.lifecycleMember.byteLength = Buffer.byteLength(
            tampered.lifecycleMember.canonicalBytes,
            "utf8",
          );
          tampered.lifecycleMember.byteSha256 = createHash("sha256")
            .update(tampered.lifecycleMember.canonicalBytes)
            .digest("hex");
          tampered.lifecycleMember.artifactId =
            substitutedLifecycle.artifactId;
          tampered.lifecycleMember.artifactDigest =
            substitutedLifecycle.artifactDigest;
          tampered.lifecycleMember.originDigest =
            substitutedLifecycle.originDigest;
          tampered.p10Head = structuredClone(
            substitutedLifecycle.predecessor,
          );
          Object.assign(tampered, rehashCapsule(tampered));
          assert.equal(
            taskMapLifecycleFacetsPublicationCanonicalBytes(tampered),
            taskMapContractCanonicalJson(tampered),
          );
        } else {
          const substitutedProjection = JSON.parse(
            tampered.projectionMember.canonicalBytes,
          ) as TaskMapProjectionV1;
          substitutedProjection.tasks[0]!.title =
            "Coordinated authority substitution";
          const substitutedProjectionDigest = diffTaskMapProjections(
            null,
            substitutedProjection,
          ).currentProjectionDigest;
          tampered.projectionMember.canonicalBytes =
            taskMapContractCanonicalJson(substitutedProjection);
          tampered.projectionMember.byteLength = Buffer.byteLength(
            tampered.projectionMember.canonicalBytes,
            "utf8",
          );
          tampered.projectionMember.byteSha256 = createHash("sha256")
            .update(tampered.projectionMember.canonicalBytes)
            .digest("hex");
          tampered.projectionMember.projectionDigest =
            substitutedProjectionDigest;

          const substitutedLifecycle = JSON.parse(
            tampered.lifecycleMember.canonicalBytes,
          ) as TaskMapLifecycleFacetsV1;
          substitutedLifecycle.predecessor.projectionDigest =
            substitutedProjectionDigest;
          substitutedLifecycle.predecessor.workControlArtifactDigest =
            digest("substituted-work-control");
          substitutedLifecycle.predecessor.workControlArtifactId =
            `tmworkcontroldecision_${
              substitutedLifecycle.predecessor.workControlArtifactDigest
            }`;
          substitutedLifecycle.predecessor.workControlOriginDigest =
            workControlOriginDigest(substitutedLifecycle.predecessor);
          rehashLifecycleArtifact(substitutedLifecycle);
          tampered.lifecycleMember.canonicalBytes =
            taskMapContractCanonicalJson(substitutedLifecycle);
          tampered.lifecycleMember.byteLength = Buffer.byteLength(
            tampered.lifecycleMember.canonicalBytes,
            "utf8",
          );
          tampered.lifecycleMember.byteSha256 = createHash("sha256")
            .update(tampered.lifecycleMember.canonicalBytes)
            .digest("hex");
          tampered.lifecycleMember.artifactId =
            substitutedLifecycle.artifactId;
          tampered.lifecycleMember.artifactDigest =
            substitutedLifecycle.artifactDigest;
          tampered.lifecycleMember.originDigest =
            substitutedLifecycle.originDigest;
          tampered.p10Head = structuredClone(
            substitutedLifecycle.predecessor,
          );
          Object.assign(tampered, rehashCapsule(tampered));
          assert.equal(
            taskMapLifecycleFacetsPublicationCanonicalBytes(tampered),
            taskMapContractCanonicalJson(tampered),
          );
        }
        await replaceCapsule(roots, tampered);
        await assert.rejects(
          readTaskMapLifecycleFacetsPublicationStore(roots),
          /publication|projection member|exact P10 predecessor|authenticated P10 history member|work-control artifact/,
        );
      });
    }
  });

  it("fails closed on file mode, symlink, hardlink, and directory replacement", async () => {
    await withProductFixture("mode", async ({ roots, projection }) => {
      await buildAndPublishTaskMapLifecycleFacets({ ...roots, projection });
      await chmod(capsulePath(roots), 0o644);
      await assert.rejects(
        readTaskMapLifecycleFacetsPublicationStore(roots),
        /same-owner 0600 regular file/,
      );
    });
    await withProductFixture("symlink", async ({ roots, projection, parent }) => {
      await buildAndPublishTaskMapLifecycleFacets({ ...roots, projection });
      const target = capsulePath(roots);
      const backup = path.join(parent, "capsule-backup.json");
      await rename(target, backup);
      await symlink(backup, target);
      await assert.rejects(
        readTaskMapLifecycleFacetsPublicationStore(roots),
        /same-owner 0600 regular file/,
      );
    });
    await withProductFixture("hardlink", async ({ roots, projection, parent }) => {
      await buildAndPublishTaskMapLifecycleFacets({ ...roots, projection });
      await link(capsulePath(roots), path.join(parent, "extra-link.json"));
      await assert.rejects(
        readTaskMapLifecycleFacetsPublicationStore(roots),
        /same-owner 0600 regular file|extra hardlink/,
      );
    });
    await withProductFixture("replacement", async ({ roots, projection }) => {
      let replaced = false;
      await assert.rejects(
        buildAndPublishTaskMapLifecycleFacets(
          { ...roots, projection },
          {
            faultInjection: async (point) => {
              if (point !== "before_final_p10_read" || replaced) return;
              replaced = true;
              const generations = path.join(
                roots.publicationRoot,
                "generations",
              );
              await rename(generations, `${generations}-replaced`);
              await mkdir(generations, { mode: 0o700 });
            },
          },
        ),
        /unknown entry|was replaced|entry bound/,
      );
      assert.equal(replaced, true);
    });
  });

  it("recovers one bounded interrupted post-link write and retries exactly", async () => {
    await withProductFixture("recovery", async ({ roots, projection }) => {
      await assert.rejects(
        buildAndPublishTaskMapLifecycleFacets(
          { ...roots, projection },
          {
            faultInjection: (point) => {
              if (point === "after_generation_link") {
                throw new Error("synthetic post-link interruption");
              }
            },
          },
        ),
        /synthetic post-link interruption/,
      );
      await assert.rejects(
        readTaskMapLifecycleFacetsPublicationStore(roots),
        /recovery is required/,
      );
      const recovery =
        await recoverTaskMapLifecycleFacetsPublicationStore(
          roots.publicationRoot,
          { externalExclusivityAsserted: true },
        );
      assert.equal(recovery.removedStageCount, 1);
      assert.equal(recovery.retainedPublicationCount, 1);
      const retry = await buildAndPublishTaskMapLifecycleFacets({
        ...roots,
        projection,
      });
      assert.equal(retry.publication.status, "already_published");
      assert.equal(
        (await readFile(capsulePath(roots), "utf8")),
        retry.capsuleCanonicalBytes,
      );
    });
  });
});
