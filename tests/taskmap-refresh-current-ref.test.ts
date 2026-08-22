import assert from "node:assert";
import { spawn } from "node:child_process";
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  readdir,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  advanceTaskMapConnectorCheckpoint,
  buildTaskMapSourceEnvelope,
  buildTaskMapSourceSnapshot,
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "../src/engine/taskmap/source-contracts.js";
import {
  TASKMAP_REFRESH_LANE_VERSION,
  TASKMAP_REFRESH_PLAN_DRAFT_VERSION,
  TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION,
  buildTaskMapRefreshPlan,
  selectTaskMapReadyBatch,
  type TaskMapRefreshLaneStateV1,
  type TaskMapRefreshPlanDraftV1,
} from "../src/engine/taskmap/refresh-plan.js";
import {
  buildTaskMapRefreshRunSourceSliceProof,
  materializeTaskMapRefreshRunBundle,
  prepareTaskMapRefreshRunBundle,
} from "../src/engine/taskmap/refresh-run-bundle.js";
import * as refreshRunBundleRuntime
  from "../src/engine/taskmap/refresh-run-bundle.js";
import {
  assertTaskMapRefreshCurrentRef,
  TASKMAP_REFRESH_CURRENT_LIMITS_V1,
  TASKMAP_REFRESH_CURRENT_REF_VERSION,
  TaskMapRefreshCurrentError,
  initializeTaskMapRefreshCurrentStore,
  publishTaskMapRefreshRunCurrent,
  readTaskMapRefreshCurrent,
  recoverTaskMapRefreshCurrentResidue,
  rollbackTaskMapRefreshCurrent,
  type TaskMapRefreshCurrentFaultPoint,
  type TaskMapRefreshCurrentRefV1,
} from "../src/engine/taskmap/refresh-current-ref.js";
import type {
  TaskMapConnectorCheckpointV1,
  TaskMapSourceAuthorityBindingV1,
  TaskMapSourceSnapshotV1,
} from "../src/engine/taskmap/types.js";

const DIRECTORY_MODE = 0o700;
const ZERO_GENERATION = "00000000000000000000";
const FIRST_GENERATION = "00000000000000000001";
const SECOND_GENERATION = "00000000000000000002";
const THIRD_GENERATION = "00000000000000000003";
const FOURTH_GENERATION = "00000000000000000004";
const digest = (label: string): string =>
  taskMapContractDigest(`refresh-current-ref-test:${label}`);
const OWNER_SCOPE_DIGEST = digest("owner");
const BINDING: TaskMapSourceAuthorityBindingV1 = {
  connectionId: "synthetic-current-ref-connection",
  sourceKind: "strategy",
  tenantOrWorkspaceDigest: digest("workspace"),
  accountOrPrincipalDigest: digest("principal"),
  grantVersion: "synthetic-read-v1",
};
const SECOND_BINDING: TaskMapSourceAuthorityBindingV1 = {
  connectionId: "synthetic-current-ref-slack-connection",
  sourceKind: "slack",
  tenantOrWorkspaceDigest: digest("slack-workspace"),
  accountOrPrincipalDigest: digest("slack-principal"),
  grantVersion: "synthetic-read-v1",
};

function policyBindings(): TaskMapRefreshPlanDraftV1["policyBindings"] {
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
    digest: digest(`policy-${name}`),
  }));
}

function lane(
  value: Omit<
    TaskMapRefreshPlanDraftV1["lanes"][number],
    "contractVersion"
  >,
): TaskMapRefreshPlanDraftV1["lanes"][number] {
  return {
    contractVersion: TASKMAP_REFRESH_LANE_VERSION,
    ...value,
  };
}

function sourceSnapshot(
  revisionLabel: string,
): TaskMapSourceSnapshotV1 {
  const envelope = buildTaskMapSourceEnvelope({
    ownerScopeDigest: OWNER_SCOPE_DIGEST,
    binding: BINDING,
    sourceKind: "strategy",
    objectType: "strategy_context",
    sourceObjectId: `synthetic-object-${revisionLabel}`,
    sourceRevision: `synthetic-revision-${revisionLabel}`,
    eventTime: "2026-07-28T12:00:00.000Z",
    contentDigest: digest(`content-${revisionLabel}`),
    authority: {
      evidence: "context_only",
      quality: "bounded_context",
      lifecycle: "none",
      completion: "none",
      rank: "context_only",
    },
  });
  return buildTaskMapSourceSnapshot([envelope], []);
}

function sourceRevisionSetDigest(
  revisions: TaskMapRefreshPlanDraftV1["sourceRevisions"],
): string {
  return taskMapContractDigest(revisions.map((revision) => ({
    sourceIdentityDigest: revision.sourceIdentityDigest,
    sourceRevisionDigest: revision.sourceRevisionDigest,
    contentDigest: revision.contentDigest,
  })));
}

function lanes(
  bindingDigest: string,
  checkpointDigest?: string,
  sourceSliceDigest?: string,
): TaskMapRefreshPlanDraftV1["lanes"] {
  const priorInputs = [
    bindingDigest,
    ...(checkpointDigest === undefined ? [] : [checkpointDigest]),
    ...(sourceSliceDigest === undefined ? [] : [sourceSliceDigest]),
  ];
  return [
    lane({
      laneId: "collect",
      goal: "provider_collect",
      operationVersion: "strategy-collect.1",
      priority: "P0",
      priorityReasonCodes: ["source_freshness"],
      predecessorLaneIds: [],
      resourceClaims: [{ resourceId: "provider:strategy", mode: "shared" }],
      effect: "read_only",
      requiredForPublication: true,
      inputDigests: priorInputs,
      outputKinds: ["connector_checkpoint", "source_slice"],
    }),
    lane({
      laneId: "normalize",
      goal: "source_normalize",
      operationVersion: "strategy-normalize.1",
      priority: "P0",
      priorityReasonCodes: ["identity_integrity"],
      predecessorLaneIds: ["collect"],
      resourceClaims: [{
        resourceId: "normalization:strategy",
        mode: "shared",
      }],
      effect: "local_state",
      requiredForPublication: true,
      inputDigests: priorInputs,
      outputKinds: ["normalized_source"],
    }),
    lane({
      laneId: "identity",
      goal: "identity_dedupe_barrier",
      operationVersion: "identity.1",
      priority: "P0",
      priorityReasonCodes: ["identity_integrity"],
      predecessorLaneIds: ["normalize"],
      resourceClaims: [{
        resourceId: "taskmap:identity",
        mode: "exclusive",
      }],
      effect: "local_state",
      requiredForPublication: true,
      inputDigests: [digest("identity-input")],
      outputKinds: ["identity_set"],
    }),
    lane({
      laneId: "gate",
      goal: "deterministic_gate",
      operationVersion: "gate.1",
      priority: "P0",
      priorityReasonCodes: ["deterministic_replay"],
      predecessorLaneIds: ["identity"],
      resourceClaims: [{ resourceId: "taskmap:gate", mode: "shared" }],
      effect: "local_state",
      requiredForPublication: true,
      inputDigests: [digest("gate-input")],
      outputKinds: ["gate_decision"],
    }),
    lane({
      laneId: "projection",
      goal: "taskmap_projection",
      operationVersion: "projection.1",
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
      operationVersion: "publication.1",
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

function genesisCompleteFixture(revisionLabel = "genesis") {
  const snapshot = sourceSnapshot(revisionLabel);
  const bindingDigest = taskMapContractDigest(BINDING);
  const checkpoint = advanceTaskMapConnectorCheckpoint(null, {
    binding: BINDING,
    sourceKind: "strategy",
    adapterVersion: "strategy-adapter.1",
    capabilities: ["read_context"],
    state: "success",
    attemptedAt: "2026-07-28T12:03:00.000Z",
    proposedWatermark: {
      kind: "revision",
      valueDigest: digest(`watermark-${revisionLabel}`),
      observedThrough: "2026-07-28T12:03:00.000Z",
    },
    acceptedSourceIdentityDigests: [
      snapshot.envelopes[0].sourceIdentityDigest,
    ],
  });
  const sourceRevisions = snapshot.envelopes.map((envelope) => ({
    bindingDigest,
    sourceIdentityDigest: envelope.sourceIdentityDigest,
    sourceRevisionDigest: taskMapContractDigest(envelope.sourceRevision),
    contentDigest: envelope.contentDigest,
  }));
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
      reviewAttestationDigest: digest("review-attestation"),
      sourceManifestDigest: digest("source-manifest"),
    },
    sourceBindings: [{
      bindingDigest,
      sourceKind: "strategy",
      sourceContractVersion: snapshot.envelopes[0].contractVersion,
      adapterVersion: "strategy-adapter.1",
    }],
    sourceRevisions,
    sourceRevisionSets: [{
      bindingDigest,
      revisionSetDigest: sourceRevisionSetDigest(sourceRevisions),
    }],
    semanticInputDigests: [snapshot.semanticInputDigest],
    deterministicReplayDigest: digest(`replay-${revisionLabel}`),
    policyBindings: policyBindings(),
    lanes: lanes(bindingDigest),
  };
  const plan = buildTaskMapRefreshPlan(draft);
  const laneStates: TaskMapRefreshLaneStateV1[] = plan.lanes.map(
    (plannedLane) => ({
      laneId: plannedLane.laneId,
      status: "succeeded",
    }),
  );
  const batch = selectTaskMapReadyBatch(plan, {
    maxConcurrency: 2,
    laneStates,
  });
  assert.strictEqual(batch.publication.state, "complete");
  const sourceSlice = buildTaskMapRefreshRunSourceSliceProof({
    ownerScopeDigest: OWNER_SCOPE_DIGEST,
    bindingDigest,
    sourceRevisions,
    acceptedSourceIdentityDigests:
      checkpoint.acceptedSourceIdentityDigests,
  });
  const prepared = prepareTaskMapRefreshRunBundle({
    plan,
    batch,
    connectorCheckpoints: [checkpoint],
    attemptOutputs: [{
      laneId: "collect",
      checkpointDigest: taskMapContractDigest(checkpoint),
      sourceSliceDigest: sourceSlice.sourceSliceDigest,
    }],
    sourceSliceProofs: [sourceSlice],
    sourceSnapshot: snapshot,
  });
  return {
    snapshot,
    plan,
    batch,
    checkpoint,
    sourceSlice,
    prepared,
  };
}

function genesisBlockedFixture() {
  const snapshot = sourceSnapshot("blocked-genesis");
  const bindingDigest = taskMapContractDigest(BINDING);
  const checkpoint = advanceTaskMapConnectorCheckpoint(null, {
    binding: BINDING,
    sourceKind: "strategy",
    adapterVersion: "strategy-adapter.1",
    capabilities: ["read_context"],
    state: "failed",
    attemptedAt: "2026-07-28T12:02:00.000Z",
    errorCode: "provider_unavailable",
    errorDetailDigest: digest("blocked-genesis-error"),
  });
  const sourceRevisions = snapshot.envelopes.map((envelope) => ({
    bindingDigest,
    sourceIdentityDigest: envelope.sourceIdentityDigest,
    sourceRevisionDigest: taskMapContractDigest(envelope.sourceRevision),
    contentDigest: envelope.contentDigest,
  }));
  const plan = buildTaskMapRefreshPlan({
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
      truthSetDigest: digest("truth-blocked"),
      reviewBatchDigest: digest("review-batch-blocked"),
      reviewAttestationVersion:
        TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION,
      reviewAttestationDigest: digest("review-attestation-blocked"),
      sourceManifestDigest: digest("source-manifest-blocked"),
    },
    sourceBindings: [{
      bindingDigest,
      sourceKind: "strategy",
      sourceContractVersion: snapshot.envelopes[0].contractVersion,
      adapterVersion: "strategy-adapter.1",
    }],
    sourceRevisions,
    sourceRevisionSets: [{
      bindingDigest,
      revisionSetDigest: sourceRevisionSetDigest(sourceRevisions),
    }],
    semanticInputDigests: [snapshot.semanticInputDigest],
    deterministicReplayDigest: digest("replay-blocked"),
    policyBindings: policyBindings(),
    lanes: lanes(bindingDigest),
  });
  const batch = selectTaskMapReadyBatch(plan, {
    maxConcurrency: 2,
    laneStates: plan.lanes.map((plannedLane) => (
      plannedLane.laneId === "collect"
        ? {
            laneId: plannedLane.laneId,
            status: "failed" as const,
            errorCode: "provider_unavailable" as const,
            errorDetailDigest: digest("blocked-genesis-error"),
          }
        : {
            laneId: plannedLane.laneId,
            status: "pending" as const,
          }
    )),
  });
  assert.strictEqual(batch.publication.state, "blocked");
  const sourceSlice = buildTaskMapRefreshRunSourceSliceProof({
    sliceRole: "observed_non_serving",
    ownerScopeDigest: OWNER_SCOPE_DIGEST,
    bindingDigest,
    sourceRevisions: [],
    acceptedSourceIdentityDigests: [],
  });
  const prepared = prepareTaskMapRefreshRunBundle({
    plan,
    batch,
    connectorCheckpoints: [checkpoint],
    attemptOutputs: [{
      laneId: "collect",
      checkpointDigest: taskMapContractDigest(checkpoint),
      sourceSliceDigest: sourceSlice.sourceSliceDigest,
    }],
    sourceSliceProofs: [sourceSlice],
    sourceSnapshot: snapshot,
  });
  return {
    snapshot,
    plan,
    batch,
    checkpoint,
    sourceSlice,
    prepared,
  };
}

function adapterUpgradeFixture(
  prior: ReturnType<typeof genesisCompleteFixture>,
  mutateBaseline?: (
    baseline: TaskMapRefreshPlanDraftV1["baseline"],
  ) => void,
) {
  const snapshot = sourceSnapshot("adapter-v2");
  const bindingDigest = taskMapContractDigest(BINDING);
  const checkpoint = advanceTaskMapConnectorCheckpoint(null, {
    binding: BINDING,
    sourceKind: "strategy",
    adapterVersion: "strategy-adapter.2",
    capabilities: ["read_context"],
    state: "success",
    attemptedAt: "2026-07-28T13:01:00.000Z",
    proposedWatermark: {
      kind: "revision",
      valueDigest: digest("watermark-adapter-v2"),
      observedThrough: "2026-07-28T13:01:00.000Z",
    },
    acceptedSourceIdentityDigests: [
      snapshot.envelopes[0].sourceIdentityDigest,
    ],
  });
  const sourceRevisions = snapshot.envelopes.map((envelope) => ({
    bindingDigest,
    sourceIdentityDigest: envelope.sourceIdentityDigest,
    sourceRevisionDigest: taskMapContractDigest(envelope.sourceRevision),
    contentDigest: envelope.contentDigest,
  }));
  const priorCheckpointDigest = taskMapContractDigest(prior.checkpoint);
  const draft: TaskMapRefreshPlanDraftV1 = {
    contractVersion: TASKMAP_REFRESH_PLAN_DRAFT_VERSION,
    ownerScopeDigest: OWNER_SCOPE_DIGEST,
    baseline: {
      kind: "accepted",
      priorCheckpointDigests: [priorCheckpointDigest],
      priorSourceSliceDigests: [prior.sourceSlice.sourceSliceDigest],
      priorProviderArtifacts: [{
        bindingDigest,
        checkpointDigest: priorCheckpointDigest,
        sourceSliceDigest: prior.sourceSlice.sourceSliceDigest,
      }],
      priorAcceptedStateDigest: prior.plan.candidateAcceptedStateDigest,
      priorOwnerScopeDigest: OWNER_SCOPE_DIGEST,
      priorSourceSnapshotDigest: prior.snapshot.sourceSnapshotDigest,
      priorReviewedEvidenceDigest: prior.plan.reviewedEvidenceDigest,
      priorPolicyBundleDigest: prior.plan.policyBundleDigest,
      priorSemanticImplementationDigest:
        prior.plan.semanticImplementationDigest,
      acceptedSourceRevisions: prior.plan.sourceRevisions,
      acceptedSourceRevisionSets: prior.plan.sourceRevisionSets,
      acceptedSemanticInputDigests: prior.plan.semanticInputDigests,
      acceptedDeterministicReplayDigest:
        prior.plan.deterministicReplayDigest,
    },
    reviewedDigests: prior.plan.reviewedDigests,
    sourceBindings: [{
      bindingDigest,
      sourceKind: "strategy",
      sourceContractVersion: snapshot.envelopes[0].contractVersion,
      adapterVersion: "strategy-adapter.2",
    }],
    sourceRevisions,
    sourceRevisionSets: [{
      bindingDigest,
      revisionSetDigest: sourceRevisionSetDigest(sourceRevisions),
    }],
    semanticInputDigests: [snapshot.semanticInputDigest],
    deterministicReplayDigest: digest("replay-adapter-v2"),
    policyBindings: prior.plan.policyBindings,
    lanes: lanes(
      bindingDigest,
      priorCheckpointDigest,
      prior.sourceSlice.sourceSliceDigest,
    ),
  };
  mutateBaseline?.(draft.baseline);
  const plan = buildTaskMapRefreshPlan(draft);
  const batch = selectTaskMapReadyBatch(plan, {
    maxConcurrency: 2,
    laneStates: plan.lanes.map((plannedLane) => ({
      laneId: plannedLane.laneId,
      status: "succeeded",
    })),
  });
  assert.strictEqual(batch.publication.state, "complete");
  const sourceSlice = buildTaskMapRefreshRunSourceSliceProof({
    ownerScopeDigest: OWNER_SCOPE_DIGEST,
    bindingDigest,
    sourceRevisions,
    acceptedSourceIdentityDigests:
      checkpoint.acceptedSourceIdentityDigests,
  });
  const prepared = prepareTaskMapRefreshRunBundle({
    plan,
    batch,
    connectorCheckpoints: [checkpoint],
    attemptOutputs: [{
      laneId: "collect",
      checkpointDigest: taskMapContractDigest(checkpoint),
      sourceSliceDigest: sourceSlice.sourceSliceDigest,
    }],
    sourceSliceProofs: [sourceSlice],
    sourceSnapshot: snapshot,
  });
  return {
    snapshot,
    plan,
    batch,
    checkpoint,
    sourceSlice,
    prepared,
  };
}

function blockedAdapterAttemptFixture(
  prior: ReturnType<typeof genesisCompleteFixture>,
) {
  const snapshot = sourceSnapshot("blocked-adapter-v2");
  const bindingDigest = taskMapContractDigest(BINDING);
  const checkpoint = advanceTaskMapConnectorCheckpoint(prior.checkpoint, {
    binding: BINDING,
    sourceKind: "strategy",
    adapterVersion: "strategy-adapter.1",
    capabilities: ["read_context"],
    state: "failed",
    attemptedAt: "2026-07-28T13:02:00.000Z",
    errorCode: "provider_unavailable",
    errorDetailDigest: digest("blocked-adapter-v2-error"),
  });
  const sourceRevisions = snapshot.envelopes.map((envelope) => ({
    bindingDigest,
    sourceIdentityDigest: envelope.sourceIdentityDigest,
    sourceRevisionDigest: taskMapContractDigest(envelope.sourceRevision),
    contentDigest: envelope.contentDigest,
  }));
  const priorCheckpointDigest = taskMapContractDigest(prior.checkpoint);
  const plan = buildTaskMapRefreshPlan({
    contractVersion: TASKMAP_REFRESH_PLAN_DRAFT_VERSION,
    ownerScopeDigest: OWNER_SCOPE_DIGEST,
    baseline: {
      kind: "accepted",
      priorCheckpointDigests: [priorCheckpointDigest],
      priorSourceSliceDigests: [prior.sourceSlice.sourceSliceDigest],
      priorProviderArtifacts: [{
        bindingDigest,
        checkpointDigest: priorCheckpointDigest,
        sourceSliceDigest: prior.sourceSlice.sourceSliceDigest,
      }],
      priorAcceptedStateDigest: prior.plan.candidateAcceptedStateDigest,
      priorOwnerScopeDigest: OWNER_SCOPE_DIGEST,
      priorSourceSnapshotDigest: prior.snapshot.sourceSnapshotDigest,
      priorReviewedEvidenceDigest: prior.plan.reviewedEvidenceDigest,
      priorPolicyBundleDigest: prior.plan.policyBundleDigest,
      priorSemanticImplementationDigest:
        prior.plan.semanticImplementationDigest,
      acceptedSourceRevisions: prior.plan.sourceRevisions,
      acceptedSourceRevisionSets: prior.plan.sourceRevisionSets,
      acceptedSemanticInputDigests: prior.plan.semanticInputDigests,
      acceptedDeterministicReplayDigest:
        prior.plan.deterministicReplayDigest,
    },
    reviewedDigests: prior.plan.reviewedDigests,
    sourceBindings: [{
      bindingDigest,
      sourceKind: "strategy",
      sourceContractVersion: snapshot.envelopes[0].contractVersion,
      adapterVersion: "strategy-adapter.1",
    }],
    sourceRevisions,
    sourceRevisionSets: [{
      bindingDigest,
      revisionSetDigest: sourceRevisionSetDigest(sourceRevisions),
    }],
    semanticInputDigests: [snapshot.semanticInputDigest],
    deterministicReplayDigest: digest("replay-blocked-adapter-v2"),
    policyBindings: prior.plan.policyBindings,
    lanes: lanes(
      bindingDigest,
      priorCheckpointDigest,
      prior.sourceSlice.sourceSliceDigest,
    ),
  });
  const batch = selectTaskMapReadyBatch(plan, {
    maxConcurrency: 2,
    laneStates: plan.lanes.map((plannedLane) => (
      plannedLane.laneId === "collect"
        ? {
            laneId: plannedLane.laneId,
            status: "failed" as const,
            errorCode: "provider_unavailable" as const,
            errorDetailDigest: digest("blocked-adapter-v2-error"),
            lastGoodCheckpointDigest: priorCheckpointDigest,
            lastGoodSourceSliceDigest:
              prior.sourceSlice.sourceSliceDigest,
          }
        : {
            laneId: plannedLane.laneId,
            status: "pending" as const,
          }
    )),
  });
  assert.strictEqual(batch.publication.state, "blocked");
  const sourceSlice = prior.sourceSlice;
  const prepared = prepareTaskMapRefreshRunBundle({
    plan,
    batch,
    connectorCheckpoints: [prior.checkpoint, checkpoint],
    attemptOutputs: [{
      laneId: "collect",
      checkpointDigest: taskMapContractDigest(checkpoint),
      sourceSliceDigest: sourceSlice.sourceSliceDigest,
    }],
    sourceSliceProofs: [sourceSlice],
    sourceSnapshot: snapshot,
  });
  return {
    snapshot,
    plan,
    batch,
    checkpoint,
    sourceSlice,
    prepared,
  };
}

function splicedBlockedArtifactFixture(
  accepted: ReturnType<typeof genesisCompleteFixture>,
  blocked: ReturnType<typeof blockedAdapterAttemptFixture>,
) {
  const snapshot = sourceSnapshot("spliced-blocked-adapter");
  const bindingDigest = taskMapContractDigest(BINDING);
  const checkpoint = advanceTaskMapConnectorCheckpoint(
    blocked.checkpoint,
    {
      binding: BINDING,
      sourceKind: "strategy",
      adapterVersion: "strategy-adapter.1",
      capabilities: ["read_context"],
      state: "success",
      attemptedAt: "2026-07-28T13:03:00.000Z",
      proposedWatermark: {
        kind: "revision",
        valueDigest: digest("watermark-spliced-blocked"),
        observedThrough: "2026-07-28T13:03:00.000Z",
      },
      acceptedSourceIdentityDigests: [
        snapshot.envelopes[0].sourceIdentityDigest,
      ],
    },
  );
  const sourceRevisions = snapshot.envelopes.map((envelope) => ({
    bindingDigest,
    sourceIdentityDigest: envelope.sourceIdentityDigest,
    sourceRevisionDigest: taskMapContractDigest(envelope.sourceRevision),
    contentDigest: envelope.contentDigest,
  }));
  const blockedCheckpointDigest = taskMapContractDigest(blocked.checkpoint);
  const plan = buildTaskMapRefreshPlan({
    contractVersion: TASKMAP_REFRESH_PLAN_DRAFT_VERSION,
    ownerScopeDigest: OWNER_SCOPE_DIGEST,
    baseline: {
      kind: "accepted",
      priorCheckpointDigests: [blockedCheckpointDigest],
      priorSourceSliceDigests: [blocked.sourceSlice.sourceSliceDigest],
      priorProviderArtifacts: [{
        bindingDigest,
        checkpointDigest: blockedCheckpointDigest,
        sourceSliceDigest: blocked.sourceSlice.sourceSliceDigest,
      }],
      priorAcceptedStateDigest:
        accepted.plan.candidateAcceptedStateDigest,
      priorOwnerScopeDigest: OWNER_SCOPE_DIGEST,
      priorSourceSnapshotDigest: accepted.snapshot.sourceSnapshotDigest,
      priorReviewedEvidenceDigest: accepted.plan.reviewedEvidenceDigest,
      priorPolicyBundleDigest: accepted.plan.policyBundleDigest,
      priorSemanticImplementationDigest:
        accepted.plan.semanticImplementationDigest,
      acceptedSourceRevisions: accepted.plan.sourceRevisions,
      acceptedSourceRevisionSets: accepted.plan.sourceRevisionSets,
      acceptedSemanticInputDigests: accepted.plan.semanticInputDigests,
      acceptedDeterministicReplayDigest:
        accepted.plan.deterministicReplayDigest,
    },
    reviewedDigests: accepted.plan.reviewedDigests,
    sourceBindings: [{
      bindingDigest,
      sourceKind: "strategy",
      sourceContractVersion: snapshot.envelopes[0].contractVersion,
      adapterVersion: "strategy-adapter.1",
    }],
    sourceRevisions,
    sourceRevisionSets: [{
      bindingDigest,
      revisionSetDigest: sourceRevisionSetDigest(sourceRevisions),
    }],
    semanticInputDigests: [snapshot.semanticInputDigest],
    deterministicReplayDigest: digest("replay-spliced-blocked"),
    policyBindings: accepted.plan.policyBindings,
    lanes: lanes(
      bindingDigest,
      blockedCheckpointDigest,
      blocked.sourceSlice.sourceSliceDigest,
    ),
  });
  const batch = selectTaskMapReadyBatch(plan, {
    maxConcurrency: 2,
    laneStates: plan.lanes.map((plannedLane) => ({
      laneId: plannedLane.laneId,
      status: "succeeded",
    })),
  });
  const sourceSlice = buildTaskMapRefreshRunSourceSliceProof({
    ownerScopeDigest: OWNER_SCOPE_DIGEST,
    bindingDigest,
    sourceRevisions,
    acceptedSourceIdentityDigests:
      checkpoint.acceptedSourceIdentityDigests,
  });
  const prepared = prepareTaskMapRefreshRunBundle({
    plan,
    batch,
    connectorCheckpoints: [checkpoint],
    attemptOutputs: [{
      laneId: "collect",
      checkpointDigest: taskMapContractDigest(checkpoint),
      sourceSliceDigest: sourceSlice.sourceSliceDigest,
    }],
    sourceSliceProofs: [sourceSlice],
    sourceSnapshot: snapshot,
  });
  return {
    snapshot,
    plan,
    batch,
    checkpoint,
    sourceSlice,
    prepared,
  };
}

interface SemanticSourceFact {
  binding: TaskMapSourceAuthorityBindingV1;
  sourceObjectId: string;
  sourceRevision: string;
  contentDigest: string;
  eventTime: string;
}

interface SemanticCurrentFixture {
  snapshot: TaskMapSourceSnapshotV1;
  plan: ReturnType<typeof buildTaskMapRefreshPlan>;
  batch: ReturnType<typeof selectTaskMapReadyBatch>;
  attemptCheckpoints: TaskMapConnectorCheckpointV1[];
  sourceSliceByBinding: Map<
    string,
    ReturnType<typeof buildTaskMapRefreshRunSourceSliceProof>
  >;
  prepared: ReturnType<typeof prepareTaskMapRefreshRunBundle>;
}

function semanticSourceSnapshot(
  facts: readonly SemanticSourceFact[],
): TaskMapSourceSnapshotV1 {
  return buildTaskMapSourceSnapshot(
    facts.map((fact) => buildTaskMapSourceEnvelope({
      ownerScopeDigest: OWNER_SCOPE_DIGEST,
      binding: fact.binding,
      sourceKind: fact.binding.sourceKind,
      objectType: "strategy_context",
      sourceObjectId: fact.sourceObjectId,
      sourceRevision: fact.sourceRevision,
      eventTime: fact.eventTime,
      contentDigest: fact.contentDigest,
      authority: {
        evidence: "context_only",
        quality: "bounded_context",
        lifecycle: "none",
        completion: "none",
        rank: "context_only",
      },
    })),
    [],
  );
}

function semanticSuccessfulCheckpoint(
  previous: TaskMapConnectorCheckpointV1 | null,
  snapshot: TaskMapSourceSnapshotV1,
  binding: TaskMapSourceAuthorityBindingV1,
  label: string,
  attemptedAt: string,
): TaskMapConnectorCheckpointV1 {
  const bindingDigest = taskMapContractDigest(binding);
  const acceptedSourceIdentityDigests = snapshot.envelopes
    .filter((envelope) => (
      taskMapContractDigest(envelope.binding) === bindingDigest
    ))
    .map((envelope) => envelope.sourceIdentityDigest);
  assert.ok(acceptedSourceIdentityDigests.length > 0);
  return advanceTaskMapConnectorCheckpoint(previous, {
    binding,
    sourceKind: binding.sourceKind,
    adapterVersion: `${binding.sourceKind}-semantic-adapter.1`,
    capabilities: ["read_context"],
    state: "success",
    attemptedAt,
    proposedWatermark: {
      kind: "revision",
      valueDigest: digest(`semantic-watermark-${label}`),
      observedThrough: attemptedAt,
    },
    acceptedSourceIdentityDigests,
  });
}

function semanticFailedCheckpoint(
  previous: TaskMapConnectorCheckpointV1,
  binding: TaskMapSourceAuthorityBindingV1,
  label: string,
  attemptedAt: string,
): TaskMapConnectorCheckpointV1 {
  return advanceTaskMapConnectorCheckpoint(previous, {
    binding,
    sourceKind: binding.sourceKind,
    adapterVersion: `${binding.sourceKind}-semantic-adapter.1`,
    capabilities: ["read_context"],
    state: "failed",
    attemptedAt,
    errorCode: "provider_unavailable",
    errorDetailDigest: digest(`semantic-error-${label}`),
  });
}

function semanticRevisionSets(
  revisions: TaskMapRefreshPlanDraftV1["sourceRevisions"],
  bindingDigests: readonly string[],
): TaskMapRefreshPlanDraftV1["sourceRevisionSets"] {
  return [...bindingDigests].sort().map((bindingDigest) => {
    const bindingRevisions = revisions
      .filter((revision) => revision.bindingDigest === bindingDigest)
      .sort((left, right) => (
        left.sourceIdentityDigest.localeCompare(
          right.sourceIdentityDigest,
        )
        || left.sourceRevisionDigest.localeCompare(
          right.sourceRevisionDigest,
        )
        || left.contentDigest.localeCompare(right.contentDigest)
      ));
    return {
      bindingDigest,
      revisionSetDigest: sourceRevisionSetDigest(bindingRevisions),
    };
  });
}

function semanticPublicationFixture(input: {
  label: string;
  snapshot: TaskMapSourceSnapshotV1;
  attemptCheckpoints: readonly TaskMapConnectorCheckpointV1[];
  publicationState: "complete" | "blocked";
  acceptedOrigin?: SemanticCurrentFixture;
}): SemanticCurrentFixture {
  const sourceRevisions = input.snapshot.envelopes.map((envelope) => ({
    bindingDigest: taskMapContractDigest(envelope.binding),
    sourceIdentityDigest: envelope.sourceIdentityDigest,
    sourceRevisionDigest: taskMapContractDigest(envelope.sourceRevision),
    contentDigest: envelope.contentDigest,
  })).sort((left, right) => (
    left.bindingDigest.localeCompare(right.bindingDigest)
    || left.sourceIdentityDigest.localeCompare(
      right.sourceIdentityDigest,
    )
    || left.sourceRevisionDigest.localeCompare(
      right.sourceRevisionDigest,
    )
    || left.contentDigest.localeCompare(right.contentDigest)
  ));
  const providers = [...input.attemptCheckpoints].map((checkpoint) => {
    const bindingDigest = taskMapContractDigest(checkpoint.binding);
    const envelope = input.snapshot.envelopes.find((candidate) => (
      taskMapContractDigest(candidate.binding) === bindingDigest
    ));
    assert.ok(envelope);
    const acceptedCheckpoint = input.acceptedOrigin?.attemptCheckpoints.find(
      (candidate) => (
        taskMapContractDigest(candidate.binding) === bindingDigest
      ),
    );
    const acceptedSourceSlice =
      input.acceptedOrigin?.sourceSliceByBinding.get(bindingDigest);
    if (input.acceptedOrigin !== undefined) {
      assert.ok(acceptedCheckpoint);
      assert.ok(acceptedSourceSlice);
    }
    return {
      bindingDigest,
      sourceKind: checkpoint.sourceKind,
      sourceContractVersion: envelope.contractVersion,
      adapterVersion: checkpoint.adapterVersion,
      checkpoint,
      collectLaneId: `collect-${bindingDigest.slice(0, 12)}`,
      normalizeLaneId: `normalize-${bindingDigest.slice(0, 12)}`,
      acceptedArtifact: acceptedCheckpoint === undefined
        || acceptedSourceSlice === undefined
        ? undefined
        : {
            bindingDigest,
            checkpointDigest: taskMapContractDigest(
              acceptedCheckpoint,
            ),
            sourceSliceDigest: acceptedSourceSlice.sourceSliceDigest,
          },
    };
  }).sort((left, right) => (
    left.bindingDigest.localeCompare(right.bindingDigest)
  ));
  assert.strictEqual(
    new Set(providers.map((provider) => provider.bindingDigest)).size,
    providers.length,
  );
  const bindingDigests = providers.map(
    (provider) => provider.bindingDigest,
  );
  const priorProviderArtifacts = providers.flatMap((provider) => (
    provider.acceptedArtifact === undefined
      ? []
      : [provider.acceptedArtifact]
  ));
  const providerLanes = providers.flatMap((provider) => {
    const inputDigests = [
      provider.bindingDigest,
      ...(provider.acceptedArtifact === undefined
        ? []
        : [
            provider.acceptedArtifact.checkpointDigest,
            provider.acceptedArtifact.sourceSliceDigest,
          ]),
    ];
    return [
      lane({
        laneId: provider.collectLaneId,
        goal: "provider_collect",
        operationVersion: `${provider.sourceKind}-collect.1`,
        priority: "P0",
        priorityReasonCodes: ["source_freshness"],
        predecessorLaneIds: [],
        resourceClaims: [{
          resourceId: `provider:${provider.bindingDigest}`,
          mode: "shared",
        }],
        effect: "read_only",
        requiredForPublication: true,
        inputDigests,
        outputKinds: ["connector_checkpoint", "source_slice"],
      }),
      lane({
        laneId: provider.normalizeLaneId,
        goal: "source_normalize",
        operationVersion: `${provider.sourceKind}-normalize.1`,
        priority: "P0",
        priorityReasonCodes: ["identity_integrity"],
        predecessorLaneIds: [provider.collectLaneId],
        resourceClaims: [{
          resourceId: `normalization:${provider.bindingDigest}`,
          mode: "shared",
        }],
        effect: "local_state",
        requiredForPublication: true,
        inputDigests,
        outputKinds: ["normalized_source"],
      }),
    ];
  });
  const policy = input.acceptedOrigin?.plan.policyBindings
    ?? policyBindings();
  const reviewedDigests = input.acceptedOrigin?.plan.reviewedDigests
    ?? {
      truthSetDigest: digest("semantic-truth"),
      reviewBatchDigest: digest("semantic-review-batch"),
      reviewAttestationVersion:
        TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION,
      reviewAttestationDigest: digest("semantic-review-attestation"),
      sourceManifestDigest: digest("semantic-source-manifest"),
    };
  const draft: TaskMapRefreshPlanDraftV1 = {
    contractVersion: TASKMAP_REFRESH_PLAN_DRAFT_VERSION,
    ownerScopeDigest: OWNER_SCOPE_DIGEST,
    baseline: input.acceptedOrigin === undefined
      ? {
          kind: "genesis",
          priorCheckpointDigests: [],
          priorSourceSliceDigests: [],
          priorProviderArtifacts: [],
          acceptedSourceRevisions: [],
          acceptedSourceRevisionSets: [],
          acceptedSemanticInputDigests: [],
        }
      : {
          kind: "accepted",
          priorCheckpointDigests: priorProviderArtifacts
            .map((artifact) => artifact.checkpointDigest)
            .sort(),
          priorSourceSliceDigests: priorProviderArtifacts
            .map((artifact) => artifact.sourceSliceDigest)
            .sort(),
          priorProviderArtifacts,
          priorAcceptedStateDigest:
            input.acceptedOrigin.plan.candidateAcceptedStateDigest,
          priorOwnerScopeDigest: OWNER_SCOPE_DIGEST,
          priorSourceSnapshotDigest:
            input.acceptedOrigin.snapshot.sourceSnapshotDigest,
          priorReviewedEvidenceDigest:
            input.acceptedOrigin.plan.reviewedEvidenceDigest,
          priorPolicyBundleDigest:
            input.acceptedOrigin.plan.policyBundleDigest,
          priorSemanticImplementationDigest:
            input.acceptedOrigin.plan.semanticImplementationDigest,
          acceptedSourceRevisions:
            input.acceptedOrigin.plan.sourceRevisions,
          acceptedSourceRevisionSets:
            input.acceptedOrigin.plan.sourceRevisionSets,
          acceptedSemanticInputDigests:
            input.acceptedOrigin.plan.semanticInputDigests,
          acceptedDeterministicReplayDigest:
            input.acceptedOrigin.plan.deterministicReplayDigest,
        },
    reviewedDigests,
    sourceBindings: providers.map((provider) => ({
      bindingDigest: provider.bindingDigest,
      sourceKind: provider.sourceKind,
      sourceContractVersion: provider.sourceContractVersion,
      adapterVersion: provider.adapterVersion,
    })),
    sourceRevisions,
    sourceRevisionSets: semanticRevisionSets(
      sourceRevisions,
      bindingDigests,
    ),
    semanticInputDigests: [input.snapshot.semanticInputDigest],
    deterministicReplayDigest: digest(
      `semantic-replay-${input.label}`,
    ),
    policyBindings: policy,
    lanes: [
      ...providerLanes,
      lane({
        laneId: "semantic-identity",
        goal: "identity_dedupe_barrier",
        operationVersion: "semantic-identity.1",
        priority: "P0",
        priorityReasonCodes: ["identity_integrity"],
        predecessorLaneIds: providers.map(
          (provider) => provider.normalizeLaneId,
        ),
        resourceClaims: [{
          resourceId: "taskmap:semantic-identity",
          mode: "exclusive",
        }],
        effect: "local_state",
        requiredForPublication: true,
        inputDigests: [input.snapshot.semanticInputDigest],
        outputKinds: ["identity_set"],
      }),
      lane({
        laneId: "semantic-gate",
        goal: "deterministic_gate",
        operationVersion: "semantic-gate.1",
        priority: "P0",
        priorityReasonCodes: ["deterministic_replay"],
        predecessorLaneIds: ["semantic-identity"],
        resourceClaims: [{
          resourceId: "taskmap:semantic-gate",
          mode: "shared",
        }],
        effect: "local_state",
        requiredForPublication: true,
        inputDigests: [digest("semantic-gate-input")],
        outputKinds: ["gate_decision"],
      }),
      lane({
        laneId: "semantic-projection",
        goal: "taskmap_projection",
        operationVersion: "semantic-projection.1",
        priority: "P0",
        priorityReasonCodes: ["publication_safety"],
        predecessorLaneIds: ["semantic-gate"],
        resourceClaims: [{
          resourceId: "taskmap:semantic-projection",
          mode: "exclusive",
        }],
        effect: "local_state",
        requiredForPublication: true,
        inputDigests: [digest("semantic-projection-input")],
        outputKinds: ["taskmap_projection"],
      }),
      lane({
        laneId: "semantic-publication",
        goal: "publication",
        operationVersion: "semantic-publication.1",
        priority: "P0",
        priorityReasonCodes: ["publication_safety"],
        predecessorLaneIds: ["semantic-projection"],
        resourceClaims: [{
          resourceId: "taskmap:semantic-accepted-head",
          mode: "exclusive",
        }],
        effect: "local_state",
        requiredForPublication: true,
        inputDigests: [digest("semantic-publication-input")],
        outputKinds: ["accepted_state"],
      }),
    ],
  };
  const plan = buildTaskMapRefreshPlan(draft);
  const laneStates: TaskMapRefreshLaneStateV1[] = plan.lanes.map(
    (plannedLane): TaskMapRefreshLaneStateV1 => {
      if (input.publicationState === "complete") {
        return { laneId: plannedLane.laneId, status: "succeeded" };
      }
      const collectProvider = providers.find(
        (provider) => provider.collectLaneId === plannedLane.laneId,
      );
      if (collectProvider !== undefined) {
        if (collectProvider.checkpoint.state === "success") {
          return { laneId: plannedLane.laneId, status: "succeeded" };
        }
        assert.ok(collectProvider.acceptedArtifact);
        return {
          laneId: plannedLane.laneId,
          status: "failed",
          errorCode: "provider_unavailable",
          errorDetailDigest:
            collectProvider.checkpoint.error!.detailDigest,
          lastGoodCheckpointDigest:
            collectProvider.acceptedArtifact.checkpointDigest,
          lastGoodSourceSliceDigest:
            collectProvider.acceptedArtifact.sourceSliceDigest,
        };
      }
      const normalizedProvider = providers.find(
        (provider) => provider.normalizeLaneId === plannedLane.laneId,
      );
      if (normalizedProvider?.checkpoint.state === "success") {
        return { laneId: plannedLane.laneId, status: "succeeded" };
      }
      return { laneId: plannedLane.laneId, status: "pending" };
    },
  );
  const batch = selectTaskMapReadyBatch(plan, {
    maxConcurrency: providers.length,
    laneStates,
  });
  assert.strictEqual(batch.publication.state, input.publicationState);

  const sourceSliceByBinding = new Map<
    string,
    ReturnType<typeof buildTaskMapRefreshRunSourceSliceProof>
  >();
  for (const provider of providers) {
    if (provider.checkpoint.state === "success") {
      sourceSliceByBinding.set(
        provider.bindingDigest,
        buildTaskMapRefreshRunSourceSliceProof({
          ownerScopeDigest: OWNER_SCOPE_DIGEST,
          bindingDigest: provider.bindingDigest,
          sourceRevisions: plan.sourceRevisions.filter((revision) => (
            revision.bindingDigest === provider.bindingDigest
          )),
          acceptedSourceIdentityDigests:
            provider.checkpoint.acceptedSourceIdentityDigests,
        }),
      );
      continue;
    }
    const retained = input.acceptedOrigin?.sourceSliceByBinding.get(
      provider.bindingDigest,
    );
    assert.ok(retained);
    sourceSliceByBinding.set(provider.bindingDigest, retained);
  }
  const attemptOutputs = providers.map((provider) => ({
    laneId: provider.collectLaneId,
    checkpointDigest: taskMapContractDigest(provider.checkpoint),
    sourceSliceDigest:
      sourceSliceByBinding.get(provider.bindingDigest)!.sourceSliceDigest,
  }));
  const connectorCheckpoints = [...input.attemptCheckpoints];
  for (const provider of providers) {
    if (provider.checkpoint.state === "success") continue;
    const acceptedCheckpoint =
      input.acceptedOrigin?.attemptCheckpoints.find((candidate) => (
        taskMapContractDigest(candidate.binding)
          === provider.bindingDigest
      ));
    assert.ok(acceptedCheckpoint);
    connectorCheckpoints.push(acceptedCheckpoint);
  }
  const checkpointByDigest = new Map(connectorCheckpoints.map(
    (checkpoint) => [taskMapContractDigest(checkpoint), checkpoint],
  ));
  const sourceSliceByDigest = new Map(
    [...sourceSliceByBinding.values()].map((proof) => [
      proof.sourceSliceDigest,
      proof,
    ]),
  );
  const prepared = prepareTaskMapRefreshRunBundle({
    plan,
    batch,
    connectorCheckpoints: [...checkpointByDigest.values()],
    attemptOutputs,
    sourceSliceProofs: [...sourceSliceByDigest.values()],
    sourceSnapshot: input.snapshot,
  });
  return {
    snapshot: input.snapshot,
    plan,
    batch,
    attemptCheckpoints: [...input.attemptCheckpoints],
    sourceSliceByBinding,
    prepared,
  };
}

async function expectCurrentError(
  action: Promise<unknown>,
  code: TaskMapRefreshCurrentError["code"],
): Promise<TaskMapRefreshCurrentError> {
  let caught: unknown;
  try {
    await action;
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof TaskMapRefreshCurrentError);
  assert.strictEqual(caught.code, code);
  return caught;
}

async function withStores<T>(
  callback: (roots: {
    parent: string;
    runRoot: string;
    currentRoot: string;
  }) => Promise<T>,
): Promise<T> {
  const canonicalTmp = await realpath(tmpdir());
  const parent = await mkdtemp(
    path.join(canonicalTmp, "taskmap-current-ref-test-"),
  );
  await chmod(parent, DIRECTORY_MODE);
  const runRoot = path.join(parent, "runs");
  const currentRoot = path.join(parent, "current");
  await mkdir(runRoot, { mode: DIRECTORY_MODE });
  await mkdir(currentRoot, { mode: DIRECTORY_MODE });
  await chmod(runRoot, DIRECTORY_MODE);
  await chmod(currentRoot, DIRECTORY_MODE);
  try {
    await initializeTaskMapRefreshCurrentStore(currentRoot);
    return await callback({ parent, runRoot, currentRoot });
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

async function materializeFixture(
  runRoot: string,
  fixture: { prepared: ReturnType<typeof prepareTaskMapRefreshRunBundle> },
): Promise<void> {
  const result = await materializeTaskMapRefreshRunBundle(
    runRoot,
    fixture.prepared,
  );
  assert.strictEqual(result.status, "created");
}

const PRIMARY_OPERATION_TOKEN = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const RETRY_OPERATION_TOKEN = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

interface ReservationClaim {
  operationToken: string;
  expectedGeneration: string;
  refId: string;
  objectName: string;
  origin:
    | { kind: "bundle"; bundleId: string }
    | {
        kind: "rollback";
        targetGeneration: string;
        targetRefId: string;
      };
}

interface KilledChildResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

async function runSigkillFaultChild(input: {
  currentRoot: string;
  runRoot: string;
  bundleId: string;
  faultPoint: TaskMapRefreshCurrentFaultPoint;
  operationToken: string;
}): Promise<KilledChildResult> {
  const implementationPath = path.join(
    __dirname,
    "../src/engine/taskmap/refresh-current-ref.js",
  );
  const childProgram = `
const [
  implementationPath,
  currentRoot,
  runRoot,
  bundleId,
  operationToken,
  faultPoint,
] = process.argv.slice(1);
const { publishTaskMapRefreshRunCurrent } = require(implementationPath);
void publishTaskMapRefreshRunCurrent({
  currentRoot,
  runRoot,
  bundleId,
  expectedGeneration: "00000000000000000000",
  options: {
    operationToken,
    faultInjection(point) {
      if (point === faultPoint) {
        process.kill(process.pid, "SIGKILL");
      }
    },
  },
}).then(
  () => process.exit(91),
  (error) => {
    console.error(error);
    process.exit(92);
  },
);
`;
  const child = spawn(
    process.execPath,
    [
      "-e",
      childProgram,
      implementationPath,
      input.currentRoot,
      input.runRoot,
      input.bundleId,
      input.operationToken,
      input.faultPoint,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  return new Promise<KilledChildResult>((resolve, reject) => {
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
      reject(new Error(
        `fault child timed out at ${input.faultPoint}`,
      ));
    }, 10_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      if (timedOut) return;
      resolve({ code, signal, stdout, stderr });
    });
  });
}

function assertSigkilled(result: KilledChildResult): void {
  assert.strictEqual(
    result.code,
    null,
    `child exited instead of SIGKILL\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
  assert.strictEqual(
    result.signal,
    "SIGKILL",
    `unexpected child signal\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
}

async function createUnknownObjectSentinel(
  currentRoot: string,
  label: string,
): Promise<{
  path: string;
  bytes: Buffer;
  stats: Awaited<ReturnType<typeof lstat>>;
}> {
  const sentinelPath = path.join(
    currentRoot,
    "objects",
    `unrelated-${label}.bin`,
  );
  const bytes = Buffer.from(`unrelated-object:${label}`, "utf8");
  await writeFile(sentinelPath, bytes, { mode: 0o600 });
  return {
    path: sentinelPath,
    bytes,
    stats: await lstat(sentinelPath, { bigint: true }),
  };
}

async function assertUnknownObjectPreserved(
  sentinel: Awaited<ReturnType<typeof createUnknownObjectSentinel>>,
): Promise<void> {
  const after = await lstat(sentinel.path, { bigint: true });
  assert.strictEqual(after.dev, sentinel.stats.dev);
  assert.strictEqual(after.ino, sentinel.stats.ino);
  assert.strictEqual(after.nlink, sentinel.stats.nlink);
  assert.deepStrictEqual(await readFile(sentinel.path), sentinel.bytes);
}

async function reservationEntries(currentRoot: string): Promise<string[]> {
  return (
    await readdir(path.join(currentRoot, "reservations"))
  ).sort();
}

async function readReservationClaim(
  currentRoot: string,
  generation = FIRST_GENERATION,
): Promise<ReservationClaim> {
  return JSON.parse(
    await readlink(path.join(
      currentRoot,
      "reservations",
      `${generation}.claim`,
    )),
  ) as ReservationClaim;
}

async function claimedObjectNames(currentRoot: string): Promise<string[]> {
  const claims = (
    await reservationEntries(currentRoot)
  ).filter((name) => name.endsWith(".claim"));
  const claimed = new Set(
    await Promise.all(claims.map(async (name) => {
      const claim = JSON.parse(
        await readlink(path.join(currentRoot, "reservations", name)),
      ) as ReservationClaim;
      return claim.objectName;
    })),
  );
  return (
    await readdir(path.join(currentRoot, "objects"))
  ).filter((name) => claimed.has(name)).sort();
}

function syntheticRollbackRef(
  previous: TaskMapRefreshCurrentRefV1,
  target: TaskMapRefreshCurrentRefV1,
  generationNumber: number,
): TaskMapRefreshCurrentRefV1 {
  assert.ok(previous.attempt);
  assert.ok(target.accepted);
  const generation = generationNumber.toString().padStart(20, "0");
  const core: Omit<TaskMapRefreshCurrentRefV1, "refId"> = {
    contractVersion: TASKMAP_REFRESH_CURRENT_REF_VERSION,
    generation,
    predecessorRefId: previous.refId,
    ownerScopeDigest: previous.ownerScopeDigest,
    operation: "rollback",
    attempt: previous.attempt,
    accepted: target.accepted,
    connectorHeads: previous.connectorHeads,
    rollback: {
      targetGeneration: target.generation,
      targetRefId: target.refId,
      targetAcceptedStateDigest: target.accepted.acceptedStateDigest,
    },
    privacy: {
      sourceBodiesStored: false,
      rawOwnerIdentifiersStored: false,
      connectorSecretsStored: false,
      localPathsStored: false,
    },
  };
  return assertTaskMapRefreshCurrentRef({
    ...core,
    refId: `tmrefreshcurrent_${taskMapContractDigest(core)}`,
  });
}

async function seedSyntheticRollbackRef(
  currentRoot: string,
  ref: TaskMapRefreshCurrentRefV1,
): Promise<void> {
  assert.ok(ref.rollback);
  const operationToken = digest(
    `seeded-rollback-${ref.generation}`,
  ).slice(0, 32);
  const objectName = `${ref.refId}.${operationToken}.json`;
  const objectPath = path.join(currentRoot, "objects", objectName);
  await writeFile(
    objectPath,
    taskMapContractCanonicalJson(ref),
    { mode: 0o600 },
  );
  const stats = await lstat(objectPath, { bigint: true });
  const reservation = {
    contractVersion: "taskmap-refresh-current-reservation.v1",
    operationToken,
    expectedGeneration: ref.generation,
    expectedPredecessorRefId: ref.predecessorRefId,
    refId: ref.refId,
    objectName,
    origin: {
      kind: "rollback",
      targetGeneration: ref.rollback.targetGeneration,
      targetRefId: ref.rollback.targetRefId,
    },
  };
  const identity = {
    contractVersion: "taskmap-refresh-current-object-identity.v1",
    operationToken,
    expectedGeneration: ref.generation,
    refId: ref.refId,
    objectName,
    dev: stats.dev.toString(),
    ino: stats.ino.toString(),
  };
  await Promise.all([
    symlink(
      taskMapContractCanonicalJson(reservation),
      path.join(
        currentRoot,
        "reservations",
        `${ref.generation}.claim`,
      ),
    ),
    symlink(
      taskMapContractCanonicalJson(identity),
      path.join(
        currentRoot,
        "reservations",
        `${ref.generation}.identity`,
      ),
    ),
  ]);
  await link(
    objectPath,
    path.join(currentRoot, "generations", `${ref.generation}.ref`),
  );
}

describe("P10.1C append-only current publication", () => {
  it("publishes genesis by one hardlink CAS and retries exactly", async () => {
    await withStores(async ({ runRoot, currentRoot }) => {
      const fixture = genesisCompleteFixture();
      await materializeFixture(runRoot, fixture);
      const first = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: fixture.prepared.bundleId,
        expectedGeneration: ZERO_GENERATION,
        options: {
          operationToken: "11111111111111111111111111111111",
        },
      });
      assert.strictEqual(first.status, "published");
      assert.strictEqual(first.ref.generation, FIRST_GENERATION);
      assert.strictEqual(first.ref.operation, "complete");
      assert.strictEqual(
        first.ref.accepted?.acceptedStateDigest,
        fixture.plan.candidateAcceptedStateDigest,
      );
      assert.strictEqual(first.ref.connectorHeads.length, 1);

      const snapshot = await readTaskMapRefreshCurrent(
        currentRoot,
        runRoot,
      );
      assert.strictEqual(snapshot.status, "healthy");
      assert.strictEqual(snapshot.generations.length, 1);
      assert.strictEqual(snapshot.head?.refId, first.ref.refId);
      const claim = await readReservationClaim(currentRoot);
      const objectPath = path.join(
        currentRoot,
        "objects",
        claim.objectName,
      );
      const generationPath = path.join(
        currentRoot,
        "generations",
        `${FIRST_GENERATION}.ref`,
      );
      const [objectStats, generationStats] = await Promise.all([
        lstat(objectPath),
        lstat(generationPath),
      ]);
      assert.strictEqual(objectStats.dev, generationStats.dev);
      assert.strictEqual(objectStats.ino, generationStats.ino);
      assert.strictEqual(objectStats.nlink, 2);

      const retry = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: fixture.prepared.bundleId,
        expectedGeneration: ZERO_GENERATION,
      });
      assert.strictEqual(retry.status, "already_current");
      assert.strictEqual(retry.ref.refId, first.ref.refId);
      assert.deepStrictEqual(
        await readdir(path.join(currentRoot, "generations")),
        [`${FIRST_GENERATION}.ref`],
      );
    });
  });

  it("degrades when a durable claim origin is resealed to another valid bundle", async () => {
    await withStores(async ({ runRoot, currentRoot }) => {
      const owner = genesisCompleteFixture("origin-owner");
      const other = genesisCompleteFixture("origin-other");
      await Promise.all([
        materializeFixture(runRoot, owner),
        materializeFixture(runRoot, other),
      ]);
      const published = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: owner.prepared.bundleId,
        expectedGeneration: ZERO_GENERATION,
        options: {
          operationToken: PRIMARY_OPERATION_TOKEN,
        },
      });
      const claimPath = path.join(
        currentRoot,
        "reservations",
        `${FIRST_GENERATION}.claim`,
      );
      const claim = JSON.parse(await readlink(claimPath)) as {
        origin: { kind: string; bundleId: string };
        [key: string]: unknown;
      };
      assert.deepStrictEqual(claim.origin, {
        kind: "bundle",
        bundleId: owner.prepared.bundleId,
      });
      assert.notStrictEqual(
        other.prepared.bundleId,
        owner.prepared.bundleId,
      );
      const resealed = {
        ...claim,
        origin: {
          kind: "bundle",
          bundleId: other.prepared.bundleId,
        },
      };
      await unlink(claimPath);
      await symlink(
        taskMapContractCanonicalJson(resealed),
        claimPath,
      );

      const degraded = await readTaskMapRefreshCurrent(
        currentRoot,
        runRoot,
      );
      assert.strictEqual(degraded.status, "degraded");
      assert.strictEqual(degraded.head, undefined);
      assert.strictEqual(degraded.generations.length, 0);
      assert.strictEqual(degraded.fault?.generation, FIRST_GENERATION);
      assert.strictEqual(degraded.fault?.code, "generation_corrupt");
      assert.match(
        degraded.fault?.detail ?? "",
        /journal|reservation origin|bundle/i,
      );
      assert.strictEqual(published.ref.generation, FIRST_GENERATION);
    });
  });

  it("recovers a journaled partial object and completes on a new-token retry", async () => {
    await withStores(async ({ runRoot, currentRoot }) => {
      const fixture = genesisCompleteFixture("receipt-recovery");
      await materializeFixture(runRoot, fixture);
      const error = await expectCurrentError(
        publishTaskMapRefreshRunCurrent({
          currentRoot,
          runRoot,
          bundleId: fixture.prepared.bundleId,
          expectedGeneration: ZERO_GENERATION,
          options: {
            operationToken: PRIMARY_OPERATION_TOKEN,
            faultInjection(point) {
              if (point === "after_object_partial_write") {
                throw new Error("synthetic partial-write interruption");
              }
            },
          },
        }),
        "write_failed",
      );
      assert.strictEqual(error.committed, false);
      const receipt = error.recoveryReceipt;
      assert.ok(receipt);
      assert.strictEqual(receipt.operationToken, PRIMARY_OPERATION_TOKEN);
      const objectPath = path.join(
        currentRoot,
        "objects",
        receipt.objectName,
      );
      const partialStats = await lstat(objectPath, { bigint: true });
      assert.strictEqual(typeof partialStats.dev, "bigint");
      assert.strictEqual(typeof partialStats.ino, "bigint");
      assert.strictEqual(partialStats.nlink, 1n);
      assert.ok(partialStats.size > 0n);
      assert.ok(partialStats.size < BigInt(receipt.byteLength));
      assert.deepStrictEqual(
        await reservationEntries(currentRoot),
        [
          `${FIRST_GENERATION}.claim`,
          `${FIRST_GENERATION}.identity`,
        ],
      );

      assert.strictEqual(
        await recoverTaskMapRefreshCurrentResidue(
          currentRoot,
          runRoot,
          receipt,
        ),
        "recovered",
      );
      const recoveredStats = await lstat(objectPath, { bigint: true });
      assert.strictEqual(recoveredStats.dev, partialStats.dev);
      assert.strictEqual(recoveredStats.ino, partialStats.ino);
      assert.strictEqual(recoveredStats.nlink, 1n);
      assert.strictEqual(recoveredStats.size, BigInt(receipt.byteLength));
      assert.strictEqual(
        await recoverTaskMapRefreshCurrentResidue(
          currentRoot,
          runRoot,
          receipt,
        ),
        "already_complete",
      );

      const completed = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: fixture.prepared.bundleId,
        expectedGeneration: ZERO_GENERATION,
        options: {
          operationToken: RETRY_OPERATION_TOKEN,
        },
      });
      assert.strictEqual(completed.status, "published");
      assert.strictEqual(completed.ref.refId, receipt.refId);
      const generationPath = path.join(
        currentRoot,
        "generations",
        `${FIRST_GENERATION}.ref`,
      );
      const [finalObjectStats, generationStats] = await Promise.all([
        lstat(objectPath, { bigint: true }),
        lstat(generationPath, { bigint: true }),
      ]);
      assert.strictEqual(typeof finalObjectStats.dev, "bigint");
      assert.strictEqual(typeof finalObjectStats.ino, "bigint");
      assert.strictEqual(finalObjectStats.dev, partialStats.dev);
      assert.strictEqual(finalObjectStats.ino, partialStats.ino);
      assert.strictEqual(finalObjectStats.dev, generationStats.dev);
      assert.strictEqual(finalObjectStats.ino, generationStats.ino);
      assert.strictEqual(finalObjectStats.nlink, 2n);
      assert.strictEqual(generationStats.nlink, 2n);
      assert.strictEqual((await reservationEntries(currentRoot)).length, 2);
      const exactRetry = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: fixture.prepared.bundleId,
        expectedGeneration: ZERO_GENERATION,
        options: {
          operationToken: "dddddddddddddddddddddddddddddddd",
        },
      });
      assert.strictEqual(exactRetry.status, "already_current");
      assert.strictEqual(exactRetry.ref.refId, completed.ref.refId);
      assert.deepStrictEqual(
        await readdir(path.join(currentRoot, "generations")),
        [`${FIRST_GENERATION}.ref`],
      );
    });
  });

  it("resumes a real SIGKILL partial write without replacing unknown residue", async () => {
    await withStores(async ({ runRoot, currentRoot }) => {
      const fixture = genesisCompleteFixture("sigkill-partial");
      await materializeFixture(runRoot, fixture);
      const unknown = await createUnknownObjectSentinel(
        currentRoot,
        "partial-write",
      );
      const killed = await runSigkillFaultChild({
        currentRoot,
        runRoot,
        bundleId: fixture.prepared.bundleId,
        faultPoint: "after_object_partial_write",
        operationToken: PRIMARY_OPERATION_TOKEN,
      });
      assertSigkilled(killed);

      const afterCrash = await readTaskMapRefreshCurrent(
        currentRoot,
        runRoot,
      );
      assert.strictEqual(afterCrash.status, "empty");
      const objectNames = await claimedObjectNames(currentRoot);
      assert.strictEqual(objectNames.length, 1);
      const objectPath = path.join(
        currentRoot,
        "objects",
        objectNames[0],
      );
      const partialStats = await lstat(objectPath, { bigint: true });
      assert.strictEqual(partialStats.nlink, 1n);
      assert.ok(partialStats.size > 0n);
      assert.deepStrictEqual(
        await reservationEntries(currentRoot),
        [
          `${FIRST_GENERATION}.claim`,
          `${FIRST_GENERATION}.identity`,
        ],
      );
      const claimPath = path.join(
        currentRoot,
        "reservations",
        `${FIRST_GENERATION}.claim`,
      );
      const claimBeforeRestart = await readlink(claimPath);

      const restarted = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: fixture.prepared.bundleId,
        expectedGeneration: ZERO_GENERATION,
        options: {
          operationToken: RETRY_OPERATION_TOKEN,
        },
      });
      assert.strictEqual(restarted.status, "published");
      assert.strictEqual(
        await readlink(claimPath),
        claimBeforeRestart,
      );
      const generationPath = path.join(
        currentRoot,
        "generations",
        `${FIRST_GENERATION}.ref`,
      );
      const [objectStats, generationStats] = await Promise.all([
        lstat(objectPath, { bigint: true }),
        lstat(generationPath, { bigint: true }),
      ]);
      assert.strictEqual(typeof objectStats.dev, "bigint");
      assert.strictEqual(typeof objectStats.ino, "bigint");
      assert.strictEqual(objectStats.dev, partialStats.dev);
      assert.strictEqual(objectStats.ino, partialStats.ino);
      assert.strictEqual(objectStats.dev, generationStats.dev);
      assert.strictEqual(objectStats.ino, generationStats.ino);
      assert.strictEqual(objectStats.nlink, 2n);
      assert.strictEqual(generationStats.nlink, 2n);
      assert.ok(partialStats.size < objectStats.size);
      assert.strictEqual((await claimedObjectNames(currentRoot)).length, 1);
      assert.strictEqual((await reservationEntries(currentRoot)).length, 2);
      await assertUnknownObjectPreserved(unknown);
    });
  });

  it("reconstructs identity after a real SIGKILL before the identity journal", async () => {
    await withStores(async ({ runRoot, currentRoot }) => {
      const fixture = genesisCompleteFixture("sigkill-pre-identity");
      await materializeFixture(runRoot, fixture);
      const killed = await runSigkillFaultChild({
        currentRoot,
        runRoot,
        bundleId: fixture.prepared.bundleId,
        faultPoint: "after_object_create_before_identity",
        operationToken: PRIMARY_OPERATION_TOKEN,
      });
      assertSigkilled(killed);

      assert.deepStrictEqual(
        await reservationEntries(currentRoot),
        [`${FIRST_GENERATION}.claim`],
      );
      const objectNames = await claimedObjectNames(currentRoot);
      assert.strictEqual(objectNames.length, 1);
      const objectPath = path.join(
        currentRoot,
        "objects",
        objectNames[0],
      );
      const unjournaledStats = await lstat(objectPath, { bigint: true });
      assert.strictEqual(unjournaledStats.nlink, 1n);
      assert.strictEqual(unjournaledStats.size, 0n);

      const restarted = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: fixture.prepared.bundleId,
        expectedGeneration: ZERO_GENERATION,
        options: {
          operationToken: RETRY_OPERATION_TOKEN,
        },
      });
      assert.strictEqual(restarted.status, "published");
      assert.deepStrictEqual(
        await reservationEntries(currentRoot),
        [
          `${FIRST_GENERATION}.claim`,
          `${FIRST_GENERATION}.identity`,
        ],
      );
      const generationPath = path.join(
        currentRoot,
        "generations",
        `${FIRST_GENERATION}.ref`,
      );
      const [objectStats, generationStats] = await Promise.all([
        lstat(objectPath, { bigint: true }),
        lstat(generationPath, { bigint: true }),
      ]);
      assert.strictEqual(objectStats.dev, unjournaledStats.dev);
      assert.strictEqual(objectStats.ino, unjournaledStats.ino);
      assert.strictEqual(objectStats.dev, generationStats.dev);
      assert.strictEqual(objectStats.ino, generationStats.ino);
      assert.strictEqual(objectStats.nlink, 2n);
      assert.strictEqual(generationStats.nlink, 2n);
    });
  });

  it("keeps a synced claim immutable across abandonment and exact restart", async () => {
    await withStores(async ({ runRoot, currentRoot }) => {
      const owner = genesisCompleteFixture("claim-owner");
      const contender = genesisCompleteFixture("claim-contender");
      await Promise.all([
        materializeFixture(runRoot, owner),
        materializeFixture(runRoot, contender),
      ]);
      assert.notStrictEqual(
        owner.prepared.bundleId,
        contender.prepared.bundleId,
      );
      const unknown = await createUnknownObjectSentinel(
        currentRoot,
        "claim-only",
      );
      const killed = await runSigkillFaultChild({
        currentRoot,
        runRoot,
        bundleId: owner.prepared.bundleId,
        faultPoint: "after_reservation_directory_sync",
        operationToken: PRIMARY_OPERATION_TOKEN,
      });
      assertSigkilled(killed);

      const claimPath = path.join(
        currentRoot,
        "reservations",
        `${FIRST_GENERATION}.claim`,
      );
      const claimBeforeContention = await readlink(claimPath);
      const abandonedClaim = await readReservationClaim(currentRoot);
      assert.deepStrictEqual(abandonedClaim.origin, {
        kind: "bundle",
        bundleId: owner.prepared.bundleId,
      });
      assert.deepStrictEqual(
        await reservationEntries(currentRoot),
        [`${FIRST_GENERATION}.claim`],
      );
      assert.strictEqual((await claimedObjectNames(currentRoot)).length, 0);
      assert.strictEqual(
        (await readTaskMapRefreshCurrent(currentRoot, runRoot)).status,
        "empty",
      );

      const loser = await expectCurrentError(
        publishTaskMapRefreshRunCurrent({
          currentRoot,
          runRoot,
          bundleId: contender.prepared.bundleId,
          expectedGeneration: ZERO_GENERATION,
          options: {
            operationToken: "cccccccccccccccccccccccccccccccc",
          },
        }),
        "recovery_required",
      );
      assert.strictEqual(loser.recoveryReceipt, undefined);
      const pendingRecovery = loser.pendingRecovery;
      assert.ok(pendingRecovery);
      assert.strictEqual(pendingRecovery.generation, FIRST_GENERATION);
      assert.strictEqual(pendingRecovery.refId, abandonedClaim.refId);
      assert.deepStrictEqual(pendingRecovery.origin, {
        kind: "bundle",
        bundleId: owner.prepared.bundleId,
      });
      assert.strictEqual(pendingRecovery.state, "claim_only");
      assert.strictEqual(
        "operationToken" in pendingRecovery,
        false,
      );
      assert.strictEqual(
        await readlink(claimPath),
        claimBeforeContention,
      );
      assert.strictEqual((await claimedObjectNames(currentRoot)).length, 0);
      assert.strictEqual(
        (await readTaskMapRefreshCurrent(currentRoot, runRoot)).status,
        "empty",
      );

      const restarted = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: owner.prepared.bundleId,
        expectedGeneration: ZERO_GENERATION,
        options: {
          operationToken: RETRY_OPERATION_TOKEN,
        },
      });
      assert.strictEqual(restarted.status, "published");
      assert.strictEqual(restarted.ref.generation, FIRST_GENERATION);
      assert.strictEqual(
        await readlink(claimPath),
        claimBeforeContention,
      );
      const claim = await readReservationClaim(currentRoot);
      assert.strictEqual(claim.refId, restarted.ref.refId);
      const objectNames = await claimedObjectNames(currentRoot);
      assert.deepStrictEqual(objectNames, [claim.objectName]);
      assert.deepStrictEqual(
        await reservationEntries(currentRoot),
        [
          `${FIRST_GENERATION}.claim`,
          `${FIRST_GENERATION}.identity`,
        ],
      );
      const [objectStats, generationStats] = await Promise.all([
        lstat(
          path.join(currentRoot, "objects", claim.objectName),
          { bigint: true },
        ),
        lstat(
          path.join(
            currentRoot,
            "generations",
            `${FIRST_GENERATION}.ref`,
          ),
          { bigint: true },
        ),
      ]);
      assert.strictEqual(objectStats.dev, generationStats.dev);
      assert.strictEqual(objectStats.ino, generationStats.ino);
      assert.strictEqual(objectStats.nlink, 2n);
      await assertUnknownObjectPreserved(unknown);
    });
  });

  it("refuses occupied legacy object paths without mutating empty or exact-prefix bytes", async () => {
    await withStores(async ({ runRoot, currentRoot }) => {
      const fixture = genesisCompleteFixture("legacy-empty");
      await materializeFixture(runRoot, fixture);
      const interrupted = await expectCurrentError(
        publishTaskMapRefreshRunCurrent({
          currentRoot,
          runRoot,
          bundleId: fixture.prepared.bundleId,
          expectedGeneration: ZERO_GENERATION,
          options: {
            operationToken: PRIMARY_OPERATION_TOKEN,
            faultInjection(point) {
              if (point === "after_reservation_directory_sync") {
                throw new Error("stop after durable claim");
              }
            },
          },
        }),
        "write_failed",
      );
      assert.strictEqual(interrupted.recoveryReceipt, undefined);
      const claim = await readReservationClaim(currentRoot);
      const legacyPath = path.join(
        currentRoot,
        "objects",
        `${claim.refId}.json`,
      );
      await writeFile(legacyPath, Buffer.alloc(0), { mode: 0o600 });
      const before = await lstat(legacyPath, { bigint: true });

      await expectCurrentError(
        publishTaskMapRefreshRunCurrent({
          currentRoot,
          runRoot,
          bundleId: fixture.prepared.bundleId,
          expectedGeneration: ZERO_GENERATION,
          options: {
            operationToken: RETRY_OPERATION_TOKEN,
          },
        }),
        "unsafe_target",
      );
      const after = await lstat(legacyPath, { bigint: true });
      assert.strictEqual(after.dev, before.dev);
      assert.strictEqual(after.ino, before.ino);
      assert.strictEqual(after.size, 0n);
      assert.deepStrictEqual(await readFile(legacyPath), Buffer.alloc(0));
      assert.strictEqual((await claimedObjectNames(currentRoot)).length, 0);
      assert.deepStrictEqual(
        await reservationEntries(currentRoot),
        [`${FIRST_GENERATION}.claim`],
      );
      assert.strictEqual(
        (await readTaskMapRefreshCurrent(currentRoot, runRoot)).status,
        "empty",
      );
    });

    await withStores(async ({ runRoot, currentRoot }) => {
      const fixture = genesisCompleteFixture("legacy-prefix");
      await materializeFixture(runRoot, fixture);
      const interrupted = await expectCurrentError(
        publishTaskMapRefreshRunCurrent({
          currentRoot,
          runRoot,
          bundleId: fixture.prepared.bundleId,
          expectedGeneration: ZERO_GENERATION,
          options: {
            operationToken: PRIMARY_OPERATION_TOKEN,
            faultInjection(point) {
              if (point === "after_object_partial_write") {
                throw new Error("stop with canonical claimed prefix");
              }
            },
          },
        }),
        "write_failed",
      );
      const receipt = interrupted.recoveryReceipt;
      assert.ok(receipt);
      const claimedPath = path.join(
        currentRoot,
        "objects",
        receipt.objectName,
      );
      const exactPrefix = await readFile(claimedPath);
      assert.ok(exactPrefix.length > 0);
      assert.ok(exactPrefix.length < receipt.byteLength);
      const legacyPath = path.join(
        currentRoot,
        "objects",
        `${receipt.refId}.json`,
      );
      await writeFile(legacyPath, exactPrefix, { mode: 0o600 });
      const [legacyBefore, claimedBefore] = await Promise.all([
        lstat(legacyPath, { bigint: true }),
        lstat(claimedPath, { bigint: true }),
      ]);

      await expectCurrentError(
        publishTaskMapRefreshRunCurrent({
          currentRoot,
          runRoot,
          bundleId: fixture.prepared.bundleId,
          expectedGeneration: ZERO_GENERATION,
          options: {
            operationToken: RETRY_OPERATION_TOKEN,
          },
        }),
        "unsafe_target",
      );
      const [legacyAfter, claimedAfter] = await Promise.all([
        lstat(legacyPath, { bigint: true }),
        lstat(claimedPath, { bigint: true }),
      ]);
      assert.strictEqual(legacyAfter.dev, legacyBefore.dev);
      assert.strictEqual(legacyAfter.ino, legacyBefore.ino);
      assert.deepStrictEqual(await readFile(legacyPath), exactPrefix);
      assert.strictEqual(claimedAfter.dev, claimedBefore.dev);
      assert.strictEqual(claimedAfter.ino, claimedBefore.ino);
      assert.deepStrictEqual(await readFile(claimedPath), exactPrefix);
      assert.strictEqual((await claimedObjectNames(currentRoot)).length, 1);
      assert.deepStrictEqual(
        await readdir(path.join(currentRoot, "generations")),
        [],
      );
      assert.strictEqual(
        (await readTaskMapRefreshCurrent(currentRoot, runRoot)).status,
        "empty",
      );
    });
  });

  it("admits exactly one distinct candidate under N-way genesis contention", async () => {
    await withStores(async ({ runRoot, currentRoot }) => {
      const candidateCount = 16;
      const candidates = Array.from(
        { length: candidateCount },
        (_, index) => genesisCompleteFixture(`contention-${index}`),
      );
      assert.strictEqual(
        new Set(
          candidates.map((candidate) => candidate.prepared.bundleId),
        ).size,
        candidateCount,
      );
      await Promise.all(
        candidates.map((candidate) => (
          materializeFixture(runRoot, candidate)
        )),
      );

      let releaseWinner!: () => void;
      const winnerRelease = new Promise<void>((resolve) => {
        releaseWinner = resolve;
      });
      let markReservationLinked!: () => void;
      const reservationLinked = new Promise<void>((resolve) => {
        markReservationLinked = resolve;
      });
      let markAllLosersSettled!: () => void;
      const allLosersSettled = new Promise<void>((resolve) => {
        markAllLosersSettled = resolve;
      });
      let rejectedBeforeObject = 0;
      const attempts = candidates.map((candidate, index) => (
        publishTaskMapRefreshRunCurrent({
          currentRoot,
          runRoot,
          bundleId: candidate.prepared.bundleId,
          expectedGeneration: ZERO_GENERATION,
          options: {
            operationToken: (index + 1)
              .toString(16)
              .padStart(32, "0"),
            async faultInjection(point) {
              if (point === "after_reservation_link") {
                markReservationLinked();
                await winnerRelease;
              }
            },
          },
        }).catch((error: unknown) => {
          rejectedBeforeObject += 1;
          if (rejectedBeforeObject === candidateCount - 1) {
            markAllLosersSettled();
          }
          throw error;
        })
      ));
      const settledPromise = Promise.allSettled(attempts);
      await reservationLinked;
      await allLosersSettled;
      let precommitClaim!: ReservationClaim;
      try {
        assert.deepStrictEqual(
          await reservationEntries(currentRoot),
          [`${FIRST_GENERATION}.claim`],
        );
        assert.deepStrictEqual(
          await readdir(path.join(currentRoot, "objects")),
          [],
        );
        precommitClaim = await readReservationClaim(currentRoot);
      } finally {
        releaseWinner();
      }

      const settled = await settledPromise;
      const winners = settled.filter(
        (
          result,
        ): result is PromiseFulfilledResult<
          Awaited<ReturnType<typeof publishTaskMapRefreshRunCurrent>>
        > => result.status === "fulfilled",
      );
      const losers = settled.filter(
        (result): result is PromiseRejectedResult => (
          result.status === "rejected"
        ),
      );
      assert.strictEqual(winners.length, 1);
      assert.strictEqual(winners[0].value.status, "published");
      assert.strictEqual(
        winners[0].value.ref.generation,
        FIRST_GENERATION,
      );
      assert.strictEqual(losers.length, candidateCount - 1);
      for (const loser of losers) {
        assert.ok(loser.reason instanceof TaskMapRefreshCurrentError);
        assert.strictEqual(loser.reason.code, "recovery_required");
        assert.strictEqual(loser.reason.committed, false);
        assert.strictEqual(loser.reason.recoveryReceipt, undefined);
        const pendingRecovery = loser.reason.pendingRecovery;
        assert.ok(pendingRecovery);
        assert.strictEqual(
          pendingRecovery.generation,
          FIRST_GENERATION,
        );
        assert.strictEqual(pendingRecovery.refId, precommitClaim.refId);
        assert.deepStrictEqual(
          pendingRecovery.origin,
          precommitClaim.origin,
        );
        assert.strictEqual(pendingRecovery.state, "claim_only");
        assert.strictEqual(
          "operationToken" in pendingRecovery,
          false,
        );
      }

      const objectNames = await claimedObjectNames(currentRoot);
      assert.strictEqual(objectNames.length, 1);
      assert.deepStrictEqual(
        await readdir(path.join(currentRoot, "generations")),
        [`${FIRST_GENERATION}.ref`],
      );
      assert.deepStrictEqual(
        await reservationEntries(currentRoot),
        [
          `${FIRST_GENERATION}.claim`,
          `${FIRST_GENERATION}.identity`,
        ],
      );
      const claim = await readReservationClaim(currentRoot);
      assert.strictEqual(claim.refId, winners[0].value.ref.refId);
      assert.strictEqual(
        objectNames[0],
        claim.objectName,
      );
      assert.deepStrictEqual(
        await readdir(path.join(currentRoot, "objects")),
        [claim.objectName],
      );
      const [objectStats, generationStats] = await Promise.all([
        lstat(
          path.join(currentRoot, "objects", objectNames[0]),
          { bigint: true },
        ),
        lstat(
          path.join(
            currentRoot,
            "generations",
            `${FIRST_GENERATION}.ref`,
          ),
          { bigint: true },
        ),
      ]);
      assert.strictEqual(objectStats.dev, generationStats.dev);
      assert.strictEqual(objectStats.ino, generationStats.ino);
      assert.strictEqual(objectStats.nlink, 2n);
      assert.strictEqual(generationStats.nlink, 2n);
      const snapshot = await readTaskMapRefreshCurrent(
        currentRoot,
        runRoot,
      );
      assert.strictEqual(snapshot.status, "healthy");
      assert.strictEqual(snapshot.generations.length, 1);
      assert.strictEqual(snapshot.head?.refId, winners[0].value.ref.refId);
    });
  });

  it("converges 32 release-gated same-candidate writers without extra residue", async () => {
    const writerCount = 32;
    const rounds = 3;
    for (let round = 0; round < rounds; round += 1) {
      await withStores(async ({ runRoot, currentRoot }) => {
        const fixture = genesisCompleteFixture(
          `same-candidate-${round}`,
        );
        await materializeFixture(runRoot, fixture);
        let releaseStart!: () => void;
        const start = new Promise<void>((resolve) => {
          releaseStart = resolve;
        });
        let markAllReady!: () => void;
        const allReady = new Promise<void>((resolve) => {
          markAllReady = resolve;
        });
        let ready = 0;
        const attempts = Array.from(
          { length: writerCount },
          (_, index) => (async () => {
            ready += 1;
            if (ready === writerCount) markAllReady();
            await start;
            return publishTaskMapRefreshRunCurrent({
              currentRoot,
              runRoot,
              bundleId: fixture.prepared.bundleId,
              expectedGeneration: ZERO_GENERATION,
              options: {
                operationToken: (round * writerCount + index + 1)
                  .toString(16)
                  .padStart(32, "0"),
              },
            });
          })(),
        );
        await allReady;
        releaseStart();
        const results = await Promise.all(attempts);
        assert.strictEqual(
          results.filter((result) => result.status === "published").length,
          1,
        );
        assert.strictEqual(
          results.filter(
            (result) => result.status === "already_current",
          ).length,
          writerCount - 1,
        );
        assert.strictEqual(
          new Set(results.map((result) => result.ref.refId)).size,
          1,
        );

        const claim = await readReservationClaim(currentRoot);
        assert.strictEqual(claim.refId, results[0].ref.refId);
        assert.deepStrictEqual(
          await readdir(path.join(currentRoot, "objects")),
          [claim.objectName],
        );
        assert.deepStrictEqual(
          await readdir(path.join(currentRoot, "generations")),
          [`${FIRST_GENERATION}.ref`],
        );
        assert.deepStrictEqual(
          await reservationEntries(currentRoot),
          [
            `${FIRST_GENERATION}.claim`,
            `${FIRST_GENERATION}.identity`,
          ],
        );
        const [objectStats, generationStats] = await Promise.all([
          lstat(
            path.join(currentRoot, "objects", claim.objectName),
            { bigint: true },
          ),
          lstat(
            path.join(
              currentRoot,
              "generations",
              `${FIRST_GENERATION}.ref`,
            ),
            { bigint: true },
          ),
        ]);
        assert.strictEqual(objectStats.dev, generationStats.dev);
        assert.strictEqual(objectStats.ino, generationStats.ino);
        assert.strictEqual(objectStats.nlink, 2n);
        assert.strictEqual(generationStats.nlink, 2n);
        const snapshot = await readTaskMapRefreshCurrent(
          currentRoot,
          runRoot,
        );
        assert.strictEqual(snapshot.status, "healthy");
        assert.strictEqual(snapshot.generations.length, 1);
      });
    }
  });

  it("keeps genesis retryable after a blocked pre-acceptance attempt", async () => {
    await withStores(async ({ runRoot, currentRoot }) => {
      const blocked = genesisBlockedFixture();
      const complete = genesisCompleteFixture();
      await materializeFixture(runRoot, blocked);
      await materializeFixture(runRoot, complete);
      const first = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: blocked.prepared.bundleId,
        expectedGeneration: ZERO_GENERATION,
      });
      assert.strictEqual(first.ref.operation, "blocked");
      assert.strictEqual(first.ref.accepted, undefined);
      assert.strictEqual(first.ref.connectorHeads.length, 1);

      const second = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: complete.prepared.bundleId,
        expectedGeneration: FIRST_GENERATION,
        expectedRefId: first.ref.refId,
      });
      assert.strictEqual(second.ref.operation, "complete");
      assert.strictEqual(
        second.ref.accepted?.originGeneration,
        "00000000000000000002",
      );
      assert.strictEqual(second.ref.connectorHeads.length, 1);
      assert.strictEqual(
        second.ref.connectorHeads[0].latestCheckpoint.checkpointDigest,
        taskMapContractDigest(complete.checkpoint),
      );
      const snapshot = await readTaskMapRefreshCurrent(
        currentRoot,
        runRoot,
      );
      assert.strictEqual(snapshot.status, "healthy");
      assert.strictEqual(snapshot.generations.length, 2);
    });
  });

  it("starts an adapter upgrade as a new full lineage and retains the old one", async () => {
    await withStores(async ({ runRoot, currentRoot }) => {
      const firstFixture = genesisCompleteFixture();
      const upgrade = adapterUpgradeFixture(firstFixture);
      await materializeFixture(runRoot, firstFixture);
      await materializeFixture(runRoot, upgrade);
      const first = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: firstFixture.prepared.bundleId,
        expectedGeneration: ZERO_GENERATION,
      });
      const second = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: upgrade.prepared.bundleId,
        expectedGeneration: FIRST_GENERATION,
        expectedRefId: first.ref.refId,
      });
      assert.strictEqual(second.ref.connectorHeads.length, 2);
      assert.deepStrictEqual(
        second.ref.connectorHeads.map((head) => head.adapterVersion).sort(),
        ["strategy-adapter.1", "strategy-adapter.2"],
      );
      const upgradedHead = second.ref.connectorHeads.find(
        (head) => head.adapterVersion === "strategy-adapter.2",
      )!;
      assert.strictEqual(
        upgradedHead.latestCheckpoint.checkpointDigest,
        taskMapContractDigest(upgrade.checkpoint),
      );
      assert.deepStrictEqual(
        upgrade.checkpoint.watermarkHistoryDigests,
        [upgrade.checkpoint.watermark!.valueDigest],
      );
      const reopened = await readTaskMapRefreshCurrent(
        currentRoot,
        runRoot,
      );
      assert.strictEqual(reopened.status, "healthy");
      assert.strictEqual(reopened.generations.length, 2);
      assert.strictEqual(reopened.head?.refId, second.ref.refId);
    });
  });

  it("rejects a semantic baseline spliced onto a true accepted digest", async () => {
    await withStores(async ({ runRoot, currentRoot }) => {
      const firstFixture = genesisCompleteFixture();
      const forged = adapterUpgradeFixture(
        firstFixture,
        (baseline) => {
          baseline.acceptedSemanticInputDigests = [
            digest("forged-accepted-semantic-input"),
          ];
        },
      );
      await materializeFixture(runRoot, firstFixture);
      await materializeFixture(runRoot, forged);
      const first = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: firstFixture.prepared.bundleId,
        expectedGeneration: ZERO_GENERATION,
      });
      await expectCurrentError(
        publishTaskMapRefreshRunCurrent({
          currentRoot,
          runRoot,
          bundleId: forged.prepared.bundleId,
          expectedGeneration: FIRST_GENERATION,
          expectedRefId: first.ref.refId,
        }),
        "invalid_contract",
      );
      const snapshot = await readTaskMapRefreshCurrent(
        currentRoot,
        runRoot,
      );
      assert.strictEqual(snapshot.status, "healthy");
      assert.strictEqual(snapshot.generations.length, 1);
    });
  });

  it("never promotes a baseline artifact sourced only from a blocked attempt", async () => {
    await withStores(async ({ runRoot, currentRoot }) => {
      const accepted = genesisCompleteFixture();
      const blocked = blockedAdapterAttemptFixture(accepted);
      const spliced = splicedBlockedArtifactFixture(accepted, blocked);
      await materializeFixture(runRoot, accepted);
      await materializeFixture(runRoot, blocked);
      await materializeFixture(runRoot, spliced);
      const first = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: accepted.prepared.bundleId,
        expectedGeneration: ZERO_GENERATION,
      });
      const second = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: blocked.prepared.bundleId,
        expectedGeneration: FIRST_GENERATION,
        expectedRefId: first.ref.refId,
      });
      assert.strictEqual(second.ref.operation, "blocked");
      assert.strictEqual(
        second.ref.accepted?.bundleId,
        accepted.prepared.bundleId,
      );
      await expectCurrentError(
        publishTaskMapRefreshRunCurrent({
          currentRoot,
          runRoot,
          bundleId: spliced.prepared.bundleId,
          expectedGeneration: "00000000000000000002",
          expectedRefId: second.ref.refId,
        }),
        "invalid_contract",
      );
      const snapshot = await readTaskMapRefreshCurrent(
        currentRoot,
        runRoot,
      );
      assert.strictEqual(snapshot.status, "healthy");
      assert.strictEqual(snapshot.generations.length, 2);
    });
  });

  it("keeps accepted semantics at G1 while mixed connector heads make forward progress", async () => {
    await withStores(async ({ runRoot, currentRoot }) => {
      const bindingADigest = taskMapContractDigest(BINDING);
      const bindingBDigest = taskMapContractDigest(SECOND_BINDING);
      const g1Snapshot = semanticSourceSnapshot([
        {
          binding: BINDING,
          sourceObjectId: "mixed-forward-a",
          sourceRevision: "A1",
          contentDigest: digest("mixed-forward-a1-content"),
          eventTime: "2026-07-28T10:00:00.000Z",
        },
        {
          binding: SECOND_BINDING,
          sourceObjectId: "mixed-forward-b",
          sourceRevision: "B1",
          contentDigest: digest("mixed-forward-b1-content"),
          eventTime: "2026-07-28T10:01:00.000Z",
        },
      ]);
      const a1 = semanticSuccessfulCheckpoint(
        null,
        g1Snapshot,
        BINDING,
        "mixed-a1",
        "2026-07-28T10:10:00.000Z",
      );
      const b1 = semanticSuccessfulCheckpoint(
        null,
        g1Snapshot,
        SECOND_BINDING,
        "mixed-b1",
        "2026-07-28T10:11:00.000Z",
      );
      const g1 = semanticPublicationFixture({
        label: "mixed-g1",
        snapshot: g1Snapshot,
        attemptCheckpoints: [a1, b1],
        publicationState: "complete",
      });

      const g2Snapshot = semanticSourceSnapshot([
        {
          binding: BINDING,
          sourceObjectId: "mixed-forward-a",
          sourceRevision: "A2",
          contentDigest: digest("mixed-forward-a2-content"),
          eventTime: "2026-07-28T11:00:00.000Z",
        },
        {
          binding: SECOND_BINDING,
          sourceObjectId: "mixed-forward-b",
          sourceRevision: "B1",
          contentDigest: digest("mixed-forward-b1-content"),
          eventTime: "2026-07-28T11:01:00.000Z",
        },
      ]);
      const a2 = semanticSuccessfulCheckpoint(
        a1,
        g2Snapshot,
        BINDING,
        "mixed-a2",
        "2026-07-28T11:10:00.000Z",
      );
      const b2Failed = semanticFailedCheckpoint(
        b1,
        SECOND_BINDING,
        "mixed-b2",
        "2026-07-28T11:11:00.000Z",
      );
      const g2 = semanticPublicationFixture({
        label: "mixed-g2-blocked",
        snapshot: g2Snapshot,
        attemptCheckpoints: [a2, b2Failed],
        publicationState: "blocked",
        acceptedOrigin: g1,
      });

      const g3Snapshot = semanticSourceSnapshot([
        {
          binding: BINDING,
          sourceObjectId: "mixed-forward-a",
          sourceRevision: "A3",
          contentDigest: digest("mixed-forward-a3-content"),
          eventTime: "2026-07-28T12:00:00.000Z",
        },
        {
          binding: SECOND_BINDING,
          sourceObjectId: "mixed-forward-b",
          sourceRevision: "B2",
          contentDigest: digest("mixed-forward-b2-content"),
          eventTime: "2026-07-28T12:01:00.000Z",
        },
      ]);
      const a3 = semanticSuccessfulCheckpoint(
        a2,
        g3Snapshot,
        BINDING,
        "mixed-a3",
        "2026-07-28T12:10:00.000Z",
      );
      const b3 = semanticSuccessfulCheckpoint(
        b2Failed,
        g3Snapshot,
        SECOND_BINDING,
        "mixed-b3",
        "2026-07-28T12:11:00.000Z",
      );
      const g3 = semanticPublicationFixture({
        label: "mixed-g3-complete",
        snapshot: g3Snapshot,
        attemptCheckpoints: [a3, b3],
        publicationState: "complete",
        acceptedOrigin: g1,
      });
      assert.strictEqual(g3.plan.baseline.kind, "accepted");
      if (g3.plan.baseline.kind !== "accepted") assert.fail();
      assert.strictEqual(
        g3.plan.baseline.priorAcceptedStateDigest,
        g1.plan.candidateAcceptedStateDigest,
      );
      assert.deepStrictEqual(
        g3.plan.baseline.priorCheckpointDigests,
        [taskMapContractDigest(a1), taskMapContractDigest(b1)].sort(),
      );
      assert.deepStrictEqual(
        a3.watermarkHistoryDigests,
        [
          a1.watermark!.valueDigest,
          a2.watermark!.valueDigest,
          a3.watermark!.valueDigest,
        ].sort(),
      );
      assert.strictEqual(b2Failed.state, "failed");
      assert.strictEqual(
        b2Failed.watermark!.valueDigest,
        b1.watermark!.valueDigest,
      );
      assert.deepStrictEqual(
        b3.watermarkHistoryDigests,
        [
          b1.watermark!.valueDigest,
          b3.watermark!.valueDigest,
        ].sort(),
      );

      await Promise.all([
        materializeFixture(runRoot, g1),
        materializeFixture(runRoot, g2),
        materializeFixture(runRoot, g3),
      ]);
      const first = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: g1.prepared.bundleId,
        expectedGeneration: ZERO_GENERATION,
      });
      const second = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: g2.prepared.bundleId,
        expectedGeneration: FIRST_GENERATION,
        expectedRefId: first.ref.refId,
      });
      assert.strictEqual(second.ref.operation, "blocked");
      assert.strictEqual(
        second.ref.accepted?.bundleId,
        g1.prepared.bundleId,
      );
      assert.strictEqual(
        second.ref.accepted?.originGeneration,
        FIRST_GENERATION,
      );
      const secondA = second.ref.connectorHeads.find(
        (head) => head.bindingDigest === bindingADigest,
      );
      const secondB = second.ref.connectorHeads.find(
        (head) => head.bindingDigest === bindingBDigest,
      );
      assert.ok(secondA);
      assert.ok(secondB);
      assert.strictEqual(
        secondA.latestCheckpoint.checkpointDigest,
        taskMapContractDigest(a2),
      );
      assert.strictEqual(
        secondA.lastGood?.checkpointDigest,
        taskMapContractDigest(a2),
      );
      assert.strictEqual(
        secondB.latestCheckpoint.checkpointDigest,
        taskMapContractDigest(b2Failed),
      );
      assert.strictEqual(
        secondB.lastGood?.checkpointDigest,
        taskMapContractDigest(b1),
      );

      const third = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: g3.prepared.bundleId,
        expectedGeneration: SECOND_GENERATION,
        expectedRefId: second.ref.refId,
      });
      assert.strictEqual(third.ref.operation, "complete");
      assert.strictEqual(
        third.ref.accepted?.bundleId,
        g3.prepared.bundleId,
      );
      assert.strictEqual(
        third.ref.accepted?.originGeneration,
        THIRD_GENERATION,
      );
      const thirdA = third.ref.connectorHeads.find(
        (head) => head.bindingDigest === bindingADigest,
      );
      const thirdB = third.ref.connectorHeads.find(
        (head) => head.bindingDigest === bindingBDigest,
      );
      assert.ok(thirdA);
      assert.ok(thirdB);
      assert.strictEqual(
        thirdA.latestCheckpoint.checkpointDigest,
        taskMapContractDigest(a3),
      );
      assert.strictEqual(
        thirdA.lastGood?.checkpointDigest,
        taskMapContractDigest(a3),
      );
      assert.strictEqual(
        thirdB.latestCheckpoint.checkpointDigest,
        taskMapContractDigest(b3),
      );
      assert.strictEqual(
        thirdB.lastGood?.checkpointDigest,
        taskMapContractDigest(b3),
      );
      const reopened = await readTaskMapRefreshCurrent(
        currentRoot,
        runRoot,
      );
      assert.strictEqual(reopened.status, "healthy");
      assert.strictEqual(reopened.generations.length, 3);
      assert.strictEqual(reopened.head?.refId, third.ref.refId);
    });
  });

  it("appends rollback while preserving attempt and connector progress for a later forward publish", async () => {
    await withStores(async ({ runRoot, currentRoot }) => {
      const g1Snapshot = semanticSourceSnapshot([{
        binding: BINDING,
        sourceObjectId: "rollback-forward-object",
        sourceRevision: "rollback-r1",
        contentDigest: digest("rollback-forward-c1"),
        eventTime: "2026-07-28T13:00:00.000Z",
      }]);
      const checkpoint1 = semanticSuccessfulCheckpoint(
        null,
        g1Snapshot,
        BINDING,
        "rollback-forward-1",
        "2026-07-28T13:10:00.000Z",
      );
      const g1 = semanticPublicationFixture({
        label: "rollback-forward-g1",
        snapshot: g1Snapshot,
        attemptCheckpoints: [checkpoint1],
        publicationState: "complete",
      });
      const g2Snapshot = semanticSourceSnapshot([{
        binding: BINDING,
        sourceObjectId: "rollback-forward-object",
        sourceRevision: "rollback-r2",
        contentDigest: digest("rollback-forward-c2"),
        eventTime: "2026-07-28T14:00:00.000Z",
      }]);
      const checkpoint2 = semanticSuccessfulCheckpoint(
        checkpoint1,
        g2Snapshot,
        BINDING,
        "rollback-forward-2",
        "2026-07-28T14:10:00.000Z",
      );
      const g2 = semanticPublicationFixture({
        label: "rollback-forward-g2",
        snapshot: g2Snapshot,
        attemptCheckpoints: [checkpoint2],
        publicationState: "complete",
        acceptedOrigin: g1,
      });
      const g4Snapshot = semanticSourceSnapshot([{
        binding: BINDING,
        sourceObjectId: "rollback-forward-object",
        sourceRevision: "rollback-r3",
        contentDigest: digest("rollback-forward-c3"),
        eventTime: "2026-07-28T15:00:00.000Z",
      }]);
      const checkpoint4 = semanticSuccessfulCheckpoint(
        checkpoint2,
        g4Snapshot,
        BINDING,
        "rollback-forward-4",
        "2026-07-28T15:10:00.000Z",
      );
      const g4 = semanticPublicationFixture({
        label: "rollback-forward-g4",
        snapshot: g4Snapshot,
        attemptCheckpoints: [checkpoint4],
        publicationState: "complete",
        acceptedOrigin: g1,
      });
      assert.strictEqual(g4.plan.baseline.kind, "accepted");
      if (g4.plan.baseline.kind !== "accepted") assert.fail();
      assert.strictEqual(
        g4.plan.baseline.priorAcceptedStateDigest,
        g1.plan.candidateAcceptedStateDigest,
      );
      assert.deepStrictEqual(
        g4.plan.baseline.priorCheckpointDigests,
        [taskMapContractDigest(checkpoint1)],
      );
      assert.deepStrictEqual(
        checkpoint4.watermarkHistoryDigests,
        [
          checkpoint1.watermark!.valueDigest,
          checkpoint2.watermark!.valueDigest,
          checkpoint4.watermark!.valueDigest,
        ].sort(),
      );

      await Promise.all([
        materializeFixture(runRoot, g1),
        materializeFixture(runRoot, g2),
        materializeFixture(runRoot, g4),
      ]);
      const first = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: g1.prepared.bundleId,
        expectedGeneration: ZERO_GENERATION,
      });
      const second = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: g2.prepared.bundleId,
        expectedGeneration: FIRST_GENERATION,
        expectedRefId: first.ref.refId,
      });
      const rollback = await rollbackTaskMapRefreshCurrent({
        currentRoot,
        runRoot,
        targetGeneration: FIRST_GENERATION,
        expectedGeneration: SECOND_GENERATION,
        expectedRefId: second.ref.refId,
      });
      assert.strictEqual(rollback.ref.generation, THIRD_GENERATION);
      assert.strictEqual(rollback.ref.operation, "rollback");
      assert.deepStrictEqual(rollback.ref.attempt, second.ref.attempt);
      assert.deepStrictEqual(
        rollback.ref.connectorHeads,
        second.ref.connectorHeads,
      );
      assert.deepStrictEqual(rollback.ref.accepted, first.ref.accepted);
      assert.strictEqual(
        rollback.ref.rollback?.targetGeneration,
        FIRST_GENERATION,
      );
      assert.strictEqual(
        rollback.ref.connectorHeads[0]
          .latestCheckpoint.checkpointDigest,
        taskMapContractDigest(checkpoint2),
      );

      const fourth = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: g4.prepared.bundleId,
        expectedGeneration: THIRD_GENERATION,
        expectedRefId: rollback.ref.refId,
      });
      assert.strictEqual(fourth.ref.generation, FOURTH_GENERATION);
      assert.strictEqual(fourth.ref.operation, "complete");
      assert.strictEqual(
        fourth.ref.accepted?.originGeneration,
        FOURTH_GENERATION,
      );
      assert.strictEqual(
        fourth.ref.connectorHeads[0]
          .latestCheckpoint.checkpointDigest,
        taskMapContractDigest(checkpoint4),
      );
      assert.strictEqual(
        fourth.ref.attempt?.generation,
        FOURTH_GENERATION,
      );
      const reopened = await readTaskMapRefreshCurrent(
        currentRoot,
        runRoot,
      );
      assert.strictEqual(reopened.status, "healthy");
      assert.strictEqual(reopened.generations.length, 4);
      assert.strictEqual(reopened.head?.refId, fourth.ref.refId);
    });
  });

  it("rejects conflicting content for a source revision accepted before rollback", async () => {
    await withStores(async ({ runRoot, currentRoot }) => {
      const sourceObjectId = "immutable-revision-ledger-object";
      const g1Snapshot = semanticSourceSnapshot([{
        binding: BINDING,
        sourceObjectId,
        sourceRevision: "ledger-r1",
        contentDigest: digest("ledger-c1"),
        eventTime: "2026-07-28T16:00:00.000Z",
      }]);
      const checkpoint1 = semanticSuccessfulCheckpoint(
        null,
        g1Snapshot,
        BINDING,
        "ledger-1",
        "2026-07-28T16:10:00.000Z",
      );
      const g1 = semanticPublicationFixture({
        label: "ledger-g1",
        snapshot: g1Snapshot,
        attemptCheckpoints: [checkpoint1],
        publicationState: "complete",
      });
      const g2Snapshot = semanticSourceSnapshot([{
        binding: BINDING,
        sourceObjectId,
        sourceRevision: "ledger-r2",
        contentDigest: digest("ledger-c2"),
        eventTime: "2026-07-28T17:00:00.000Z",
      }]);
      const checkpoint2 = semanticSuccessfulCheckpoint(
        checkpoint1,
        g2Snapshot,
        BINDING,
        "ledger-2",
        "2026-07-28T17:10:00.000Z",
      );
      const g2 = semanticPublicationFixture({
        label: "ledger-g2",
        snapshot: g2Snapshot,
        attemptCheckpoints: [checkpoint2],
        publicationState: "complete",
        acceptedOrigin: g1,
      });
      const conflictingSnapshot = semanticSourceSnapshot([{
        binding: BINDING,
        sourceObjectId,
        sourceRevision: "ledger-r2",
        contentDigest: digest("ledger-c3-conflict"),
        eventTime: "2026-07-28T18:00:00.000Z",
      }]);
      assert.strictEqual(
        conflictingSnapshot.envelopes[0].sourceIdentityDigest,
        g2Snapshot.envelopes[0].sourceIdentityDigest,
      );
      assert.strictEqual(
        taskMapContractDigest(
          conflictingSnapshot.envelopes[0].sourceRevision,
        ),
        taskMapContractDigest(g2Snapshot.envelopes[0].sourceRevision),
      );
      assert.notStrictEqual(
        conflictingSnapshot.envelopes[0].contentDigest,
        g2Snapshot.envelopes[0].contentDigest,
      );
      const conflictingCheckpoint = semanticSuccessfulCheckpoint(
        checkpoint2,
        conflictingSnapshot,
        BINDING,
        "ledger-4-conflict",
        "2026-07-28T18:10:00.000Z",
      );
      const conflicting = semanticPublicationFixture({
        label: "ledger-g4-conflict",
        snapshot: conflictingSnapshot,
        attemptCheckpoints: [conflictingCheckpoint],
        publicationState: "complete",
        acceptedOrigin: g1,
      });

      await Promise.all([
        materializeFixture(runRoot, g1),
        materializeFixture(runRoot, g2),
        materializeFixture(runRoot, conflicting),
      ]);
      const first = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: g1.prepared.bundleId,
        expectedGeneration: ZERO_GENERATION,
      });
      const second = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: g2.prepared.bundleId,
        expectedGeneration: FIRST_GENERATION,
        expectedRefId: first.ref.refId,
      });
      const rollback = await rollbackTaskMapRefreshCurrent({
        currentRoot,
        runRoot,
        targetGeneration: FIRST_GENERATION,
        expectedGeneration: SECOND_GENERATION,
        expectedRefId: second.ref.refId,
      });
      const error = await expectCurrentError(
        publishTaskMapRefreshRunCurrent({
          currentRoot,
          runRoot,
          bundleId: conflicting.prepared.bundleId,
          expectedGeneration: THIRD_GENERATION,
          expectedRefId: rollback.ref.refId,
        }),
        "invalid_contract",
      );
      assert.strictEqual(error.committed, false);
      assert.match(
        error.message,
        /immutable accepted source history/i,
      );
      const reopened = await readTaskMapRefreshCurrent(
        currentRoot,
        runRoot,
      );
      assert.strictEqual(reopened.status, "healthy");
      assert.strictEqual(reopened.generations.length, 3);
      assert.strictEqual(reopened.head?.generation, THIRD_GENERATION);
      assert.strictEqual(reopened.head?.refId, rollback.ref.refId);
      assert.deepStrictEqual(
        await readdir(path.join(currentRoot, "generations")),
        [
          `${FIRST_GENERATION}.ref`,
          `${SECOND_GENERATION}.ref`,
          `${THIRD_GENERATION}.ref`,
        ],
      );
    });
  });
});

function cloneCurrentRef(
  ref: TaskMapRefreshCurrentRefV1,
): TaskMapRefreshCurrentRefV1 {
  return structuredClone(ref);
}

function expectSynchronousCurrentError(
  action: () => unknown,
  code: TaskMapRefreshCurrentError["code"],
): TaskMapRefreshCurrentError {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof TaskMapRefreshCurrentError);
  assert.strictEqual(caught.code, code);
  return caught;
}

async function captureFile(filePath: string) {
  return {
    path: filePath,
    bytes: await readFile(filePath),
    stats: await lstat(filePath, { bigint: true }),
  };
}

async function assertFilePreserved(
  before: Awaited<ReturnType<typeof captureFile>>,
): Promise<void> {
  const after = await lstat(before.path, { bigint: true });
  assert.strictEqual(after.dev, before.stats.dev);
  assert.strictEqual(after.ino, before.stats.ino);
  assert.strictEqual(after.nlink, before.stats.nlink);
  assert.strictEqual(after.size, before.stats.size);
  assert.deepStrictEqual(await readFile(before.path), before.bytes);
}

type PoisonableArrayMethod =
  | typeof Symbol.iterator
  | "filter"
  | "find"
  | "includes"
  | "map"
  | "slice"
  | "some"
  | "sort"
  | "every"
  | "flatMap"
  | "reduce"
  | "join"
  | "push"
  | "at";

function poisonableArrayMethodLabel(
  method: PoisonableArrayMethod,
): string {
  return method === Symbol.iterator ? "iterator" : method;
}

async function withPoisonedArrayMethod<T>(
  method: PoisonableArrayMethod,
  action: () => Promise<T>,
): Promise<{
  calls: number;
  result?: T;
  error?: unknown;
}> {
  const original = Object.getOwnPropertyDescriptor(
    Array.prototype,
    method,
  );
  if (original === undefined || !("value" in original)) {
    throw new Error(
      `Array.prototype.${poisonableArrayMethodLabel(method)} has no data descriptor`,
    );
  }
  let calls = 0;
  Object.defineProperty(Array.prototype, method, {
    ...original,
    value(): never {
      calls += 1;
      throw new Error(
        `poisoned Array.prototype.${poisonableArrayMethodLabel(method)} executed`,
      );
    },
  });
  let result: T | undefined;
  let error: unknown;
  try {
    result = await action();
  } catch (caught) {
    error = caught;
  } finally {
    Object.defineProperty(Array.prototype, method, original);
  }
  return {
    calls,
    ...(result === undefined ? {} : { result }),
    ...(error === undefined ? {} : { error }),
  };
}

describe("P10.1C adversarial current-ref boundaries", () => {
  it("does not invoke poisoned filter, slice, at, find, or join across current-ref-only boundaries", async () => {
    const cases: Array<{
      method: "filter" | "slice" | "at" | "find" | "join";
      run: () => Promise<void>;
    }> = [
      {
        method: "filter",
        run: async () => {
          await withStores(async ({ currentRoot, runRoot }) => {
            const generationsRoot = path.join(
              currentRoot,
              "generations",
            );
            for (let index = 0; index < 257; index += 1) {
              await writeFile(
                path.join(
                  generationsRoot,
                  `unknown-${index.toString().padStart(3, "0")}`,
                ),
                "",
                { mode: 0o600 },
              );
            }
            const outcome = await withPoisonedArrayMethod(
              "filter",
              () => readTaskMapRefreshCurrent(currentRoot, runRoot),
            );
            assert.strictEqual(outcome.calls, 0);
            assert.strictEqual(outcome.error, undefined);
            assert.ok(outcome.result);
            assert.strictEqual(outcome.result.status, "degraded");
            assert.strictEqual(
              outcome.result.fault?.code,
              "generation_limit",
            );
            assert.strictEqual(
              outcome.result.unknownGenerationNames.length,
              256,
            );
            assert.strictEqual(
              outcome.result.unknownGenerationNames[0],
              "unknown-000",
            );
            assert.ok(
              outcome.result.unknownGenerationNames.includes(
                "unknown-255",
              ),
            );
            assert.ok(
              !outcome.result.unknownGenerationNames.includes(
                "unknown-256",
              ),
            );
          });
        },
      },
      {
        method: "slice",
        run: async () => {
          await withStores(async ({ currentRoot, runRoot }) => {
            const fixture = genesisCompleteFixture(
              "poisoned-slice-exact-retry",
            );
            await materializeFixture(runRoot, fixture);
            const first = await publishTaskMapRefreshRunCurrent({
              currentRoot,
              runRoot,
              bundleId: fixture.prepared.bundleId,
              expectedGeneration: ZERO_GENERATION,
            });
            const outcome = await withPoisonedArrayMethod(
              "slice",
              () => publishTaskMapRefreshRunCurrent({
                currentRoot,
                runRoot,
                bundleId: fixture.prepared.bundleId,
                expectedGeneration: ZERO_GENERATION,
              }),
            );
            assert.strictEqual(outcome.calls, 0);
            assert.ok(
              outcome.error instanceof TaskMapRefreshCurrentError,
            );
            assert.strictEqual(
              outcome.error.code,
              "invalid_contract",
            );
            assert.strictEqual(outcome.error.committed, false);
            const retry = await publishTaskMapRefreshRunCurrent({
              currentRoot,
              runRoot,
              bundleId: fixture.prepared.bundleId,
              expectedGeneration: ZERO_GENERATION,
            });
            assert.strictEqual(retry.status, "already_current");
            assert.strictEqual(retry.ref.refId, first.ref.refId);
          });
        },
      },
      {
        method: "at",
        run: async () => {
          await withStores(async ({ currentRoot, runRoot }) => {
            const outcome = await withPoisonedArrayMethod(
              "at",
              () => readTaskMapRefreshCurrent(currentRoot, runRoot),
            );
            assert.strictEqual(outcome.calls, 0);
            assert.strictEqual(outcome.error, undefined);
            assert.ok(outcome.result);
            assert.strictEqual(outcome.result.status, "empty");
          });
        },
      },
      {
        method: "find",
        run: async () => {
          await withStores(async ({ currentRoot, runRoot }) => {
            const fixture = genesisCompleteFixture(
              "poisoned-find-recovery",
            );
            await materializeFixture(runRoot, fixture);
            const interrupted = await expectCurrentError(
              publishTaskMapRefreshRunCurrent({
                currentRoot,
                runRoot,
                bundleId: fixture.prepared.bundleId,
                expectedGeneration: ZERO_GENERATION,
                options: {
                  operationToken: PRIMARY_OPERATION_TOKEN,
                  faultInjection(point) {
                    if (point === "after_object_partial_write") {
                      throw new Error(
                        "seed a partial object for find recovery",
                      );
                    }
                  },
                },
              }),
              "write_failed",
            );
            const receipt = interrupted.recoveryReceipt;
            assert.ok(receipt);
            const outcome = await withPoisonedArrayMethod(
              "find",
              () => recoverTaskMapRefreshCurrentResidue(
                currentRoot,
                runRoot,
                receipt,
              ),
            );
            assert.strictEqual(outcome.calls, 0);
            assert.strictEqual(outcome.error, undefined);
            assert.strictEqual(outcome.result, "recovered");
            const completed = await publishTaskMapRefreshRunCurrent({
              currentRoot,
              runRoot,
              bundleId: fixture.prepared.bundleId,
              expectedGeneration: ZERO_GENERATION,
              options: { operationToken: RETRY_OPERATION_TOKEN },
            });
            assert.strictEqual(completed.status, "published");
          });
        },
      },
      {
        method: "join",
        run: async () => {
          await withStores(async ({ currentRoot, runRoot }) => {
            const fixture = genesisCompleteFixture(
              "poisoned-join-current-ref-assertion",
            );
            await materializeFixture(runRoot, fixture);
            const first = await publishTaskMapRefreshRunCurrent({
              currentRoot,
              runRoot,
              bundleId: fixture.prepared.bundleId,
              expectedGeneration: ZERO_GENERATION,
            });
            const claim = await readReservationClaim(currentRoot);
            const generationBefore = await captureFile(path.join(
              currentRoot,
              "generations",
              `${FIRST_GENERATION}.ref`,
            ));
            const objectBefore = await captureFile(path.join(
              currentRoot,
              "objects",
              claim.objectName,
            ));
            const outcome = await withPoisonedArrayMethod(
              "join",
              async () => assertTaskMapRefreshCurrentRef(first.ref),
            );
            assert.strictEqual(outcome.calls, 0);
            assert.ok(
              outcome.error instanceof TaskMapRefreshCurrentError,
            );
            assert.strictEqual(
              outcome.error.code,
              "invalid_contract",
            );
            assert.strictEqual(outcome.error.committed, false);
            await Promise.all([
              assertFilePreserved(generationBefore),
              assertFilePreserved(objectBefore),
            ]);
            const healthy = await readTaskMapRefreshCurrent(
              currentRoot,
              runRoot,
            );
            assert.strictEqual(healthy.status, "healthy");
            assert.strictEqual(healthy.head?.refId, first.ref.refId);
          });
        },
      },
    ];
    for (let index = 0; index < cases.length; index += 1) {
      await cases[index].run();
    }
  });

  it("fails closed before transitive bundle verification under poisoned some without rollback residue", async () => {
    await withStores(async ({ parent, currentRoot, runRoot }) => {
      const fixture = genesisCompleteFixture(
        "poisoned-some-rollback-verifier-guard",
      );
      await materializeFixture(runRoot, fixture);
      const first = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: fixture.prepared.bundleId,
        expectedGeneration: ZERO_GENERATION,
      });
      const claim = await readReservationClaim(currentRoot);
      const generationPath = path.join(
        currentRoot,
        "generations",
        `${FIRST_GENERATION}.ref`,
      );
      const objectPath = path.join(
        currentRoot,
        "objects",
        claim.objectName,
      );
      const [generationBefore, objectBefore] = await Promise.all([
        captureFile(generationPath),
        captureFile(objectPath),
      ]);
      const reservationNamesBefore = await reservationEntries(currentRoot);
      const reservationTargetsBefore = await Promise.all(
        reservationNamesBefore.map((name) => readlink(path.join(
          currentRoot,
          "reservations",
          name,
        ))),
      );
      const objectNamesBefore = await readdir(
        path.join(currentRoot, "objects"),
      );
      const generationNamesBefore = await readdir(
        path.join(currentRoot, "generations"),
      );

      const readOutcome = await withPoisonedArrayMethod(
        "some",
        () => readTaskMapRefreshCurrent(currentRoot, runRoot),
      );
      assert.strictEqual(readOutcome.calls, 0);
      assert.strictEqual(readOutcome.error, undefined);
      assert.ok(readOutcome.result);
      assert.strictEqual(readOutcome.result.status, "degraded");

      const rollbackOutcome = await withPoisonedArrayMethod(
        "some",
        () => rollbackTaskMapRefreshCurrent({
          currentRoot,
          runRoot,
          targetGeneration: FIRST_GENERATION,
          expectedGeneration: FIRST_GENERATION,
          expectedRefId: first.ref.refId,
        }),
      );
      assert.strictEqual(rollbackOutcome.calls, 0);
      assert.ok(
        rollbackOutcome.error instanceof TaskMapRefreshCurrentError,
      );
      assert.strictEqual(rollbackOutcome.error.code, "degraded");
      assert.strictEqual(rollbackOutcome.error.committed, false);

      assert.deepStrictEqual(
        await reservationEntries(currentRoot),
        reservationNamesBefore,
      );
      assert.deepStrictEqual(
        await Promise.all(reservationNamesBefore.map((name) => readlink(
          path.join(currentRoot, "reservations", name),
        ))),
        reservationTargetsBefore,
      );
      assert.deepStrictEqual(
        await readdir(path.join(currentRoot, "objects")),
        objectNamesBefore,
      );
      assert.deepStrictEqual(
        await readdir(path.join(currentRoot, "generations")),
        generationNamesBefore,
      );
      await Promise.all([
        assertFilePreserved(generationBefore),
        assertFilePreserved(objectBefore),
      ]);

      const healthy = await readTaskMapRefreshCurrent(
        currentRoot,
        runRoot,
      );
      assert.strictEqual(healthy.status, "healthy");
      assert.strictEqual(healthy.head?.refId, first.ref.refId);
      const rollback = await rollbackTaskMapRefreshCurrent({
        currentRoot,
        runRoot,
        targetGeneration: FIRST_GENERATION,
        expectedGeneration: FIRST_GENERATION,
        expectedRefId: first.ref.refId,
      });
      assert.strictEqual(rollback.status, "published");
      assert.strictEqual(rollback.ref.operation, "rollback");
      assert.strictEqual(rollback.ref.generation, SECOND_GENERATION);
    });
  });

  it("rejects every polluted frozen-bundle array dependency before publication without invoking it", async () => {
    const dependencies: PoisonableArrayMethod[] = [
      Symbol.iterator,
      "filter",
      "find",
      "includes",
      "map",
      "slice",
      "some",
      "sort",
      "every",
      "flatMap",
      "reduce",
      "join",
      "push",
      "at",
    ];
    for (let index = 0; index < dependencies.length; index += 1) {
      const method = dependencies[index];
      await withStores(async ({ currentRoot, runRoot }) => {
        const fixture = genesisCompleteFixture(
          `poisoned-${poisonableArrayMethodLabel(method)}-publication-guard`,
        );
        await materializeFixture(runRoot, fixture);
        const outcome = await withPoisonedArrayMethod(
          method,
          () => publishTaskMapRefreshRunCurrent({
            currentRoot,
            runRoot,
            bundleId: fixture.prepared.bundleId,
            expectedGeneration: ZERO_GENERATION,
          }),
        );
        assert.strictEqual(
          outcome.calls,
          0,
          `Array.prototype.${poisonableArrayMethodLabel(method)} was invoked`,
        );
        assert.ok(outcome.error instanceof TaskMapRefreshCurrentError);
        assert.strictEqual(outcome.error.code, "invalid_contract");
        assert.strictEqual(outcome.error.committed, false);
        assert.deepStrictEqual(
          await readdir(path.join(currentRoot, "reservations")),
          [],
        );
        assert.deepStrictEqual(
          await readdir(path.join(currentRoot, "objects")),
          [],
        );
        assert.deepStrictEqual(
          await readdir(path.join(currentRoot, "generations")),
          [],
        );

        const published = await publishTaskMapRefreshRunCurrent({
          currentRoot,
          runRoot,
          bundleId: fixture.prepared.bundleId,
          expectedGeneration: ZERO_GENERATION,
        });
        assert.strictEqual(published.status, "published");
        assert.strictEqual(
          published.ref.generation,
          FIRST_GENERATION,
        );
      });
    }
  });

  it("bounds generation listings, aggregate history bytes, and generation zero", async () => {
    await withStores(async ({ currentRoot, runRoot }) => {
      const generationRoot = path.join(currentRoot, "generations");
      const names = Array.from(
        { length: 257 },
        (_, index) => `unrelated-${index.toString().padStart(3, "0")}.bin`,
      );
      await Promise.all(names.slice(0, 256).map(async (name, index) => {
        await writeFile(
          path.join(generationRoot, name),
          Buffer.from(`unknown-generation:${index}`, "utf8"),
          { mode: 0o600 },
        );
      }));
      const firstFiles = await Promise.all(
        names.slice(0, 256).map((name) => (
          captureFile(path.join(generationRoot, name))
        )),
      );

      const exactLimit = await readTaskMapRefreshCurrent(
        currentRoot,
        runRoot,
      );
      assert.strictEqual(exactLimit.status, "empty");
      assert.strictEqual(exactLimit.fault, undefined);
      assert.deepStrictEqual(
        exactLimit.unknownGenerationNames,
        names.slice(0, 256),
      );
      await Promise.all(firstFiles.map(assertFilePreserved));

      await writeFile(
        path.join(generationRoot, names[256]),
        Buffer.from("unknown-generation:256", "utf8"),
        { mode: 0o600 },
      );
      const allFiles = await Promise.all(
        names.map((name) => captureFile(path.join(generationRoot, name))),
      );
      const overflow = await readTaskMapRefreshCurrent(
        currentRoot,
        runRoot,
      );
      assert.strictEqual(overflow.status, "degraded");
      assert.strictEqual(overflow.fault?.code, "generation_limit");
      assert.strictEqual(overflow.unknownGenerationNames.length, 256);
      assert.deepStrictEqual(
        overflow.unknownGenerationNames,
        names.slice(0, 256),
      );
      await Promise.all(allFiles.map(assertFilePreserved));
    });

    await withStores(async ({ currentRoot, runRoot }) => {
      const zeroPath = path.join(
        currentRoot,
        "generations",
        `${ZERO_GENERATION}.ref`,
      );
      await writeFile(zeroPath, "generation-zero-sentinel", {
        mode: 0o600,
      });
      const zeroBefore = await captureFile(zeroPath);
      const snapshot = await readTaskMapRefreshCurrent(
        currentRoot,
        runRoot,
      );
      assert.strictEqual(snapshot.status, "degraded");
      assert.strictEqual(snapshot.generations.length, 0);
      assert.strictEqual(snapshot.fault?.generation, ZERO_GENERATION);
      assert.strictEqual(snapshot.fault?.code, "generation_corrupt");
      assert.deepStrictEqual(snapshot.unknownGenerationNames, []);
      await assertFilePreserved(zeroBefore);
    });

    await withStores(async ({ currentRoot, runRoot }) => {
      const generationRoot = path.join(currentRoot, "generations");
      const fullRefBytes = Buffer.alloc(
        TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxRefBytes,
        0x20,
      );
      const generationNames: string[] = [];
      for (let index = 1; index <= 65; index += 1) {
        generationNames[generationNames.length] =
          `${index.toString().padStart(20, "0")}.ref`;
      }
      for (let index = 0; index < 64; index += 1) {
        await writeFile(
          path.join(generationRoot, generationNames[index]),
          fullRefBytes,
          { mode: 0o600 },
        );
      }
      const firstBefore = await captureFile(path.join(
        generationRoot,
        generationNames[0],
      ));
      const exactAggregateLimit = await readTaskMapRefreshCurrent(
        currentRoot,
        runRoot,
      );
      assert.strictEqual(exactAggregateLimit.status, "degraded");
      assert.strictEqual(
        exactAggregateLimit.fault?.code,
        "generation_corrupt",
      );

      await writeFile(
        path.join(generationRoot, generationNames[64]),
        fullRefBytes,
        { mode: 0o600 },
      );
      const lastBefore = await captureFile(path.join(
        generationRoot,
        generationNames[64],
      ));
      const aggregateOverflow = await readTaskMapRefreshCurrent(
        currentRoot,
        runRoot,
      );
      assert.strictEqual(aggregateOverflow.status, "degraded");
      assert.strictEqual(
        aggregateOverflow.fault?.code,
        "generation_limit",
      );
      assert.strictEqual(
        aggregateOverflow.fault?.generation,
        generationNames[64].slice(0, -4),
      );
      assert.deepStrictEqual(
        await readdir(generationRoot),
        generationNames,
      );
      await Promise.all([
        assertFilePreserved(firstBefore),
        assertFilePreserved(lastBefore),
      ]);
    });
  });

  it("refuses a prospective history-byte overflow before creating residue", async () => {
    await withStores(async ({ currentRoot, runRoot }) => {
      const bindings = Array.from({ length: 64 }, (_, index) => ({
        connectionId: `synthetic-cap-connection-${index}`,
        sourceKind: "strategy" as const,
        tenantOrWorkspaceDigest: digest(`cap-workspace-${index}`),
        accountOrPrincipalDigest: digest(`cap-principal-${index}`),
        grantVersion: "synthetic-read-v1",
      }));
      const snapshot = semanticSourceSnapshot(
        bindings.map((binding, index) => ({
          binding,
          sourceObjectId: `synthetic-cap-object-${index}`,
          sourceRevision: "cap-r1",
          contentDigest: digest(`cap-content-${index}`),
          eventTime: "2026-07-28T16:00:00.000Z",
        })),
      );
      const checkpoints = bindings.map((binding, index) => (
        semanticSuccessfulCheckpoint(
          null,
          snapshot,
          binding,
          `cap-checkpoint-${index}`,
          "2026-07-28T16:10:00.000Z",
        )
      ));
      const fixture = semanticPublicationFixture({
        label: "history-cap-g1",
        snapshot,
        attemptCheckpoints: checkpoints,
        publicationState: "complete",
      });
      await materializeFixture(runRoot, fixture);
      const first = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: fixture.prepared.bundleId,
        expectedGeneration: ZERO_GENERATION,
      });
      const firstBytes = Buffer.byteLength(
        taskMapContractCanonicalJson(first.ref),
        "utf8",
      );
      assert.ok(firstBytes > 32 * 1024);
      assert.ok(firstBytes <= TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxRefBytes);

      const seeded: TaskMapRefreshCurrentRefV1[] = [];
      let aggregateBytes = firstBytes;
      let previous = first.ref;
      let candidate: TaskMapRefreshCurrentRefV1 | undefined;
      for (
        let generationNumber = 2;
        generationNumber <= TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxGenerations;
        generationNumber += 1
      ) {
        const next = syntheticRollbackRef(
          previous,
          first.ref,
          generationNumber,
        );
        const nextBytes = Buffer.byteLength(
          taskMapContractCanonicalJson(next),
          "utf8",
        );
        if (
          aggregateBytes + nextBytes
            > TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxHistoryBytes
        ) {
          candidate = next;
          break;
        }
        seeded.push(next);
        aggregateBytes += nextBytes;
        previous = next;
      }
      assert.ok(candidate);
      assert.ok(seeded.length > 0);
      assert.ok(
        aggregateBytes
          <= TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxHistoryBytes,
      );
      assert.ok(
        aggregateBytes
          + Buffer.byteLength(
            taskMapContractCanonicalJson(candidate),
            "utf8",
          )
          > TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxHistoryBytes,
      );
      for (let offset = 0; offset < seeded.length; offset += 16) {
        await Promise.all(
          seeded.slice(offset, offset + 16).map((ref) => (
            seedSyntheticRollbackRef(currentRoot, ref)
          )),
        );
      }

      const beforeSnapshot = await readTaskMapRefreshCurrent(
        currentRoot,
        runRoot,
      );
      assert.strictEqual(beforeSnapshot.status, "healthy");
      assert.strictEqual(beforeSnapshot.head?.refId, previous.refId);
      const beforeListings = await Promise.all([
        readdir(path.join(currentRoot, "generations")),
        readdir(path.join(currentRoot, "objects")),
        readdir(path.join(currentRoot, "reservations")),
      ]);
      const error = await expectCurrentError(
        rollbackTaskMapRefreshCurrent({
          currentRoot,
          runRoot,
          targetGeneration: FIRST_GENERATION,
          expectedGeneration: previous.generation,
          expectedRefId: previous.refId,
        }),
        "resource_limit",
      );
      assert.strictEqual(error.committed, false);
      assert.strictEqual(error.recoveryReceipt, undefined);
      const afterListings = await Promise.all([
        readdir(path.join(currentRoot, "generations")),
        readdir(path.join(currentRoot, "objects")),
        readdir(path.join(currentRoot, "reservations")),
      ]);
      for (let index = 0; index < beforeListings.length; index += 1) {
        assert.deepStrictEqual(
          afterListings[index].sort(),
          beforeListings[index].sort(),
        );
      }
      assert.ok(
        !afterListings[0].includes(`${candidate.generation}.ref`),
      );
      assert.ok(
        !afterListings[2].includes(`${candidate.generation}.claim`),
      );
      assert.ok(
        !afterListings[2].includes(`${candidate.generation}.identity`),
      );
      const reopened = await readTaskMapRefreshCurrent(
        currentRoot,
        runRoot,
      );
      assert.strictEqual(reopened.status, "healthy");
      assert.strictEqual(reopened.head?.refId, previous.refId);
    });
  });

  it("refuses a prospective frozen-bundle budget overflow without residue", async () => {
    await withStores(async ({ currentRoot, runRoot }) => {
      const fixtures: SemanticCurrentFixture[] = [];
      let acceptedOrigin: SemanticCurrentFixture | undefined;
      let previousCheckpoint: TaskMapConnectorCheckpointV1 | null = null;
      for (let index = 1; index <= 5; index += 1) {
        const snapshot = semanticSourceSnapshot([{
          binding: BINDING,
          sourceObjectId: "bundle-budget-object",
          sourceRevision: `bundle-budget-r${index}`,
          contentDigest: digest(`bundle-budget-c${index}`),
          eventTime: `2026-07-28T${(10 + index).toString().padStart(2, "0")}:00:00.000Z`,
        }]);
        const checkpoint = semanticSuccessfulCheckpoint(
          previousCheckpoint,
          snapshot,
          BINDING,
          `bundle-budget-${index}`,
          `2026-07-28T${(10 + index).toString().padStart(2, "0")}:10:00.000Z`,
        );
        const fixture = semanticPublicationFixture({
          label: `bundle-budget-g${index}`,
          snapshot,
          attemptCheckpoints: [checkpoint],
          publicationState: "complete",
          ...(acceptedOrigin === undefined ? {} : { acceptedOrigin }),
        });
        fixtures.push(fixture);
        acceptedOrigin = fixture;
        previousCheckpoint = checkpoint;
      }
      await Promise.all(
        fixtures.map((fixture) => materializeFixture(runRoot, fixture)),
      );

      const runtime = refreshRunBundleRuntime as unknown as {
        verifyTaskMapRefreshRunBundle:
          typeof refreshRunBundleRuntime.verifyTaskMapRefreshRunBundle;
      };
      const originalVerifier = runtime.verifyTaskMapRefreshRunBundle;
      runtime.verifyTaskMapRefreshRunBundle = async (...args) => {
        const verified = await originalVerifier(...args);
        assert.strictEqual(verified.manifest.members.length, 4);
        return {
          ...verified,
          manifest: {
            ...verified.manifest,
            members: verified.manifest.members.map((member) => ({
              ...member,
              byteLength: 3_900_000,
            })),
          },
        } as Awaited<ReturnType<typeof originalVerifier>>;
      };
      try {
        let expectedGeneration = ZERO_GENERATION;
        let expectedRefId: string | undefined;
        for (let index = 0; index < 4; index += 1) {
          const published = await publishTaskMapRefreshRunCurrent({
            currentRoot,
            runRoot,
            bundleId: fixtures[index].prepared.bundleId,
            expectedGeneration,
            ...(expectedRefId === undefined ? {} : { expectedRefId }),
          });
          expectedGeneration = published.ref.generation;
          expectedRefId = published.ref.refId;
        }
        for (let readIndex = 0; readIndex < 2; readIndex += 1) {
          const healthy = await readTaskMapRefreshCurrent(
            currentRoot,
            runRoot,
          );
          assert.strictEqual(healthy.status, "healthy");
          assert.strictEqual(healthy.head?.refId, expectedRefId);
        }
        const beforeListings = await Promise.all([
          readdir(path.join(currentRoot, "generations")),
          readdir(path.join(currentRoot, "objects")),
          readdir(path.join(currentRoot, "reservations")),
        ]);
        const error = await expectCurrentError(
          publishTaskMapRefreshRunCurrent({
            currentRoot,
            runRoot,
            bundleId: fixtures[4].prepared.bundleId,
            expectedGeneration,
            expectedRefId,
          }),
          "resource_limit",
        );
        assert.strictEqual(error.committed, false);
        assert.strictEqual(error.recoveryReceipt, undefined);
        const afterListings = await Promise.all([
          readdir(path.join(currentRoot, "generations")),
          readdir(path.join(currentRoot, "objects")),
          readdir(path.join(currentRoot, "reservations")),
        ]);
        for (let index = 0; index < beforeListings.length; index += 1) {
          assert.deepStrictEqual(
            afterListings[index].sort(),
            beforeListings[index].sort(),
          );
        }
        assert.strictEqual(
          afterListings[0].length,
          4,
        );
      } finally {
        runtime.verifyTaskMapRefreshRunBundle = originalVerifier;
      }
      const reopened = await readTaskMapRefreshCurrent(
        currentRoot,
        runRoot,
      );
      assert.strictEqual(reopened.status, "healthy");
      assert.strictEqual(reopened.generations.length, 4);
    });
  });

  it("rejects inherited and accessor command fields without invoking getters", async () => {
    await withStores(async ({ currentRoot, runRoot }) => {
      const fixture = genesisCompleteFixture("descriptor-command");

      let publishInheritedReads = 0;
      const inheritedPublish = Object.create({
        get bundleId(): string {
          publishInheritedReads += 1;
          throw new Error("inherited publish field executed");
        },
      }) as Record<string, unknown>;
      Object.assign(inheritedPublish, {
        currentRoot,
        runRoot,
        expectedGeneration: ZERO_GENERATION,
      });
      await expectCurrentError(
        publishTaskMapRefreshRunCurrent(
          inheritedPublish as unknown as Parameters<
            typeof publishTaskMapRefreshRunCurrent
          >[0],
        ),
        "invalid_contract",
      );
      assert.strictEqual(publishInheritedReads, 0);

      let publishAccessorReads = 0;
      const accessorPublish: Record<string, unknown> = {
        currentRoot,
        runRoot,
        expectedGeneration: ZERO_GENERATION,
      };
      Object.defineProperty(accessorPublish, "bundleId", {
        configurable: true,
        enumerable: true,
        get(): string {
          publishAccessorReads += 1;
          throw new Error("publish accessor executed");
        },
      });
      await expectCurrentError(
        publishTaskMapRefreshRunCurrent(
          accessorPublish as unknown as Parameters<
            typeof publishTaskMapRefreshRunCurrent
          >[0],
        ),
        "invalid_contract",
      );
      assert.strictEqual(publishAccessorReads, 0);

      let rollbackInheritedReads = 0;
      const inheritedRollback = Object.create({
        get expectedRefId(): string {
          rollbackInheritedReads += 1;
          throw new Error("inherited rollback field executed");
        },
      }) as Record<string, unknown>;
      Object.assign(inheritedRollback, {
        currentRoot,
        runRoot,
        targetGeneration: FIRST_GENERATION,
        expectedGeneration: FIRST_GENERATION,
      });
      await expectCurrentError(
        rollbackTaskMapRefreshCurrent(
          inheritedRollback as unknown as Parameters<
            typeof rollbackTaskMapRefreshCurrent
          >[0],
        ),
        "invalid_contract",
      );
      assert.strictEqual(rollbackInheritedReads, 0);

      let rollbackAccessorReads = 0;
      const accessorRollback: Record<string, unknown> = {
        currentRoot,
        runRoot,
        targetGeneration: FIRST_GENERATION,
        expectedGeneration: FIRST_GENERATION,
      };
      Object.defineProperty(accessorRollback, "expectedRefId", {
        configurable: true,
        enumerable: true,
        get(): string {
          rollbackAccessorReads += 1;
          throw new Error("rollback accessor executed");
        },
      });
      await expectCurrentError(
        rollbackTaskMapRefreshCurrent(
          accessorRollback as unknown as Parameters<
            typeof rollbackTaskMapRefreshCurrent
          >[0],
        ),
        "invalid_contract",
      );
      assert.strictEqual(rollbackAccessorReads, 0);

      let inheritedOptionsReads = 0;
      const originalOptionsDescriptor =
        Object.getOwnPropertyDescriptor(Object.prototype, "options");
      Object.defineProperty(Object.prototype, "options", {
        configurable: true,
        get(): never {
          inheritedOptionsReads += 1;
          throw new Error("Object.prototype.options executed");
        },
      });
      let poisonedPublish: Promise<unknown>;
      try {
        poisonedPublish = publishTaskMapRefreshRunCurrent({
          currentRoot,
          runRoot,
          bundleId: fixture.prepared.bundleId,
          expectedGeneration: ZERO_GENERATION,
        });
      } finally {
        if (originalOptionsDescriptor === undefined) {
          Reflect.deleteProperty(Object.prototype, "options");
        } else {
          Object.defineProperty(
            Object.prototype,
            "options",
            originalOptionsDescriptor,
          );
        }
      }
      await expectCurrentError(poisonedPublish!, "invalid_contract");
      assert.strictEqual(inheritedOptionsReads, 0);
    });
  });

  it("snapshots proxy-backed publish and rollback commands without property gets", async () => {
    await withStores(async ({ currentRoot, runRoot }) => {
      const fixture = genesisCompleteFixture("proxy-command");
      await materializeFixture(runRoot, fixture);
      let getTrapReads = 0;
      const publishOptions = new Proxy(
        { operationToken: PRIMARY_OPERATION_TOKEN },
        {
          get(): never {
            getTrapReads += 1;
            throw new Error("publish options get trap executed");
          },
        },
      );
      const publishCommand = new Proxy(
        {
          currentRoot,
          runRoot,
          bundleId: fixture.prepared.bundleId,
          expectedGeneration: ZERO_GENERATION,
          options: publishOptions,
        },
        {
          get(): never {
            getTrapReads += 1;
            throw new Error("publish command get trap executed");
          },
        },
      );
      const first = await publishTaskMapRefreshRunCurrent(publishCommand);

      const rollbackOptions = new Proxy(
        { operationToken: RETRY_OPERATION_TOKEN },
        {
          get(): never {
            getTrapReads += 1;
            throw new Error("rollback options get trap executed");
          },
        },
      );
      const rollbackCommand = new Proxy(
        {
          currentRoot,
          runRoot,
          targetGeneration: FIRST_GENERATION,
          expectedGeneration: FIRST_GENERATION,
          expectedRefId: first.ref.refId,
          options: rollbackOptions,
        },
        {
          get(): never {
            getTrapReads += 1;
            throw new Error("rollback command get trap executed");
          },
        },
      );
      const second = await rollbackTaskMapRefreshCurrent(rollbackCommand);
      assert.strictEqual(second.ref.generation, SECOND_GENERATION);
      assert.strictEqual(
        second.ref.rollback?.targetGeneration,
        FIRST_GENERATION,
      );
      assert.strictEqual(
        (await readReservationClaim(currentRoot)).operationToken,
        PRIMARY_OPERATION_TOKEN,
      );
      assert.strictEqual(
        (
          await readReservationClaim(currentRoot, SECOND_GENERATION)
        ).operationToken,
        RETRY_OPERATION_TOKEN,
      );
      assert.strictEqual(getTrapReads, 0);
    });
  });

  it("uses original plain command and option values after queued mutation", async () => {
    await withStores(async ({ parent, currentRoot, runRoot }) => {
      const fixture = genesisCompleteFixture("queued-mutation");
      await materializeFixture(runRoot, fixture);
      const publishOptions: {
        operationToken: string;
        faultInjection?: () => never;
      } = { operationToken: PRIMARY_OPERATION_TOKEN };
      const publishCommand = {
        currentRoot,
        runRoot,
        bundleId: fixture.prepared.bundleId,
        expectedGeneration: ZERO_GENERATION,
        options: publishOptions,
      };
      const publishPromise = publishTaskMapRefreshRunCurrent(publishCommand);
      queueMicrotask(() => {
        publishCommand.currentRoot = path.join(parent, "mutated-current");
        publishCommand.runRoot = path.join(parent, "mutated-runs");
        publishCommand.bundleId =
          `tmrefreshrun_${digest("mutated-publish-bundle")}`;
        publishCommand.expectedGeneration = FIRST_GENERATION;
        publishOptions.operationToken = RETRY_OPERATION_TOKEN;
        publishOptions.faultInjection = () => {
          throw new Error("mutated publish options executed");
        };
      });
      const first = await publishPromise;
      assert.strictEqual(first.ref.generation, FIRST_GENERATION);
      assert.strictEqual(
        (await readReservationClaim(currentRoot)).operationToken,
        PRIMARY_OPERATION_TOKEN,
      );

      const rollbackOptions: {
        operationToken: string;
        faultInjection?: () => never;
      } = { operationToken: RETRY_OPERATION_TOKEN };
      const rollbackCommand = {
        currentRoot,
        runRoot,
        targetGeneration: FIRST_GENERATION,
        expectedGeneration: FIRST_GENERATION,
        expectedRefId: first.ref.refId,
        options: rollbackOptions,
      };
      const rollbackPromise =
        rollbackTaskMapRefreshCurrent(rollbackCommand);
      queueMicrotask(() => {
        rollbackCommand.currentRoot = path.join(
          parent,
          "mutated-rollback-current",
        );
        rollbackCommand.runRoot = path.join(
          parent,
          "mutated-rollback-runs",
        );
        rollbackCommand.targetGeneration = SECOND_GENERATION;
        rollbackCommand.expectedGeneration = ZERO_GENERATION;
        rollbackCommand.expectedRefId =
          `tmrefreshcurrent_${digest("mutated-rollback-ref")}`;
        rollbackOptions.operationToken = PRIMARY_OPERATION_TOKEN;
        rollbackOptions.faultInjection = () => {
          throw new Error("mutated rollback options executed");
        };
      });
      const second = await rollbackPromise;
      assert.strictEqual(second.ref.generation, SECOND_GENERATION);
      assert.strictEqual(
        second.ref.rollback?.targetGeneration,
        FIRST_GENERATION,
      );
      assert.strictEqual(
        (
          await readReservationClaim(currentRoot, SECOND_GENERATION)
        ).operationToken,
        RETRY_OPERATION_TOKEN,
      );
    });
  });

  it("rejects prototype optionals and hostile connector-head arrays without executing them", async () => {
    await withStores(async ({ currentRoot, runRoot }) => {
      const fixture = genesisCompleteFixture("assert-descriptors");
      await materializeFixture(runRoot, fixture);
      const published = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: fixture.prepared.bundleId,
        expectedGeneration: ZERO_GENERATION,
      });

      for (const key of [
        "predecessorRefId",
        "attempt",
        "accepted",
        "rollback",
      ] as const) {
        const candidate = cloneCurrentRef(published.ref);
        Reflect.deleteProperty(
          candidate as unknown as Record<string, unknown>,
          key,
        );
        let getterReads = 0;
        const original =
          Object.getOwnPropertyDescriptor(Object.prototype, key);
        Object.defineProperty(Object.prototype, key, {
          configurable: true,
          get(): never {
            getterReads += 1;
            throw new Error(`Object.prototype.${key} executed`);
          },
        });
        let caught: unknown;
        try {
          assertTaskMapRefreshCurrentRef(candidate);
        } catch (error) {
          caught = error;
        } finally {
          if (original === undefined) {
            Reflect.deleteProperty(Object.prototype, key);
          } else {
            Object.defineProperty(Object.prototype, key, original);
          }
        }
        assert.ok(caught instanceof TaskMapRefreshCurrentError);
        assert.strictEqual(caught.code, "invalid_contract");
        assert.strictEqual(getterReads, 0);
      }

      const inheritedLastGood = cloneCurrentRef(published.ref);
      Reflect.deleteProperty(
        inheritedLastGood.connectorHeads[0] as unknown as Record<
          string,
          unknown
        >,
        "lastGood",
      );
      let lastGoodReads = 0;
      const originalLastGood =
        Object.getOwnPropertyDescriptor(Object.prototype, "lastGood");
      Object.defineProperty(Object.prototype, "lastGood", {
        configurable: true,
        get(): never {
          lastGoodReads += 1;
          throw new Error("Object.prototype.lastGood executed");
        },
      });
      let lastGoodError: unknown;
      try {
        assertTaskMapRefreshCurrentRef(inheritedLastGood);
      } catch (error) {
        lastGoodError = error;
      } finally {
        if (originalLastGood === undefined) {
          Reflect.deleteProperty(Object.prototype, "lastGood");
        } else {
          Object.defineProperty(
            Object.prototype,
            "lastGood",
            originalLastGood,
          );
        }
      }
      assert.ok(lastGoodError instanceof TaskMapRefreshCurrentError);
      assert.strictEqual(lastGoodError.code, "invalid_contract");
      assert.strictEqual(lastGoodReads, 0);

      const iteratorCandidate = cloneCurrentRef(published.ref);
      const originalIterator = Object.getOwnPropertyDescriptor(
        Array.prototype,
        Symbol.iterator,
      )!;
      let iteratorCalls = 0;
      Object.defineProperty(Array.prototype, Symbol.iterator, {
        ...originalIterator,
        value(): never {
          iteratorCalls += 1;
          throw new Error("poisoned Array.prototype iterator executed");
        },
      });
      let iteratorError: unknown;
      try {
        assertTaskMapRefreshCurrentRef(iteratorCandidate);
      } catch (error) {
        iteratorError = error;
      } finally {
        Object.defineProperty(
          Array.prototype,
          Symbol.iterator,
          originalIterator,
        );
      }
      assert.ok(
        iteratorError instanceof TaskMapRefreshCurrentError,
        `unexpected iterator rejection: ${
          iteratorError instanceof Error
            ? iteratorError.stack
              ?? `${iteratorError.name}: ${iteratorError.message}`
            : String(iteratorError)
        }; iterator calls=${iteratorCalls}`,
      );
      assert.strictEqual(iteratorError.code, "invalid_contract");
      assert.strictEqual(iteratorCalls, 0);

      const sparseCandidate = cloneCurrentRef(published.ref);
      sparseCandidate.connectorHeads =
        new Array(1) as TaskMapRefreshCurrentRefV1["connectorHeads"];
      expectSynchronousCurrentError(
        () => assertTaskMapRefreshCurrentRef(sparseCandidate),
        "invalid_contract",
      );

      const accessorCandidate = cloneCurrentRef(published.ref);
      let connectorGetterReads = 0;
      const accessorHeads: TaskMapRefreshCurrentRefV1["connectorHeads"] =
        [];
      Object.defineProperty(accessorHeads, "0", {
        configurable: true,
        enumerable: true,
        get(): never {
          connectorGetterReads += 1;
          throw new Error("connectorHeads[0] accessor executed");
        },
      });
      accessorCandidate.connectorHeads = accessorHeads;
      expectSynchronousCurrentError(
        () => assertTaskMapRefreshCurrentRef(accessorCandidate),
        "invalid_contract",
      );
      assert.strictEqual(connectorGetterReads, 0);
    });
  });

  it("degrades when two connector heads are reversed on disk without changing refId", async () => {
    await withStores(async ({ currentRoot, runRoot }) => {
      const firstFixture = genesisCompleteFixture("reversed-head-genesis");
      const upgrade = adapterUpgradeFixture(firstFixture);
      await materializeFixture(runRoot, firstFixture);
      await materializeFixture(runRoot, upgrade);
      const first = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: firstFixture.prepared.bundleId,
        expectedGeneration: ZERO_GENERATION,
      });
      const second = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: upgrade.prepared.bundleId,
        expectedGeneration: FIRST_GENERATION,
        expectedRefId: first.ref.refId,
      });
      assert.strictEqual(second.ref.connectorHeads.length, 2);
      const generationPath = path.join(
        currentRoot,
        "generations",
        `${SECOND_GENERATION}.ref`,
      );
      const claim = await readReservationClaim(
        currentRoot,
        SECOND_GENERATION,
      );
      const objectPath = path.join(
        currentRoot,
        "objects",
        claim.objectName,
      );
      const inodeBefore = await lstat(generationPath, { bigint: true });
      const stored = JSON.parse(
        await readFile(generationPath, "utf8"),
      ) as TaskMapRefreshCurrentRefV1;
      const originalRefId = stored.refId;
      stored.connectorHeads.reverse();
      assert.strictEqual(stored.refId, originalRefId);
      const reversedBytes = taskMapContractCanonicalJson(stored);
      await writeFile(generationPath, reversedBytes);
      const generationAfter = await lstat(generationPath, { bigint: true });
      const objectAfter = await lstat(objectPath, { bigint: true });
      assert.strictEqual(generationAfter.dev, inodeBefore.dev);
      assert.strictEqual(generationAfter.ino, inodeBefore.ino);
      assert.strictEqual(objectAfter.dev, inodeBefore.dev);
      assert.strictEqual(objectAfter.ino, inodeBefore.ino);
      assert.strictEqual(await readFile(objectPath, "utf8"), reversedBytes);

      const degraded = await readTaskMapRefreshCurrent(
        currentRoot,
        runRoot,
      );
      assert.strictEqual(degraded.status, "degraded");
      assert.strictEqual(degraded.head?.refId, first.ref.refId);
      assert.strictEqual(degraded.generations.length, 1);
      assert.strictEqual(degraded.fault?.generation, SECOND_GENERATION);
      assert.strictEqual(degraded.fault?.code, "generation_corrupt");
    });
  });

  it("refuses an unknown pre-write hardlink without touching either peer", async () => {
    await withStores(async ({ parent, currentRoot, runRoot }) => {
      const fixture = genesisCompleteFixture("unknown-recovery-hardlink");
      await materializeFixture(runRoot, fixture);
      const interrupted = await expectCurrentError(
        publishTaskMapRefreshRunCurrent({
          currentRoot,
          runRoot,
          bundleId: fixture.prepared.bundleId,
          expectedGeneration: ZERO_GENERATION,
          options: {
            operationToken: PRIMARY_OPERATION_TOKEN,
            faultInjection(point) {
              if (point === "after_stage_create") {
                throw new Error("stop before the first content write");
              }
            },
          },
        }),
        "write_failed",
      );
      assert.strictEqual(interrupted.committed, false);
      const receipt = interrupted.recoveryReceipt;
      assert.ok(receipt);
      const objectPath = path.join(
        currentRoot,
        "objects",
        receipt.objectName,
      );
      const peerPath = path.join(parent, "unknown-hardlink-peer.bin");
      await link(objectPath, peerPath);
      const objectBefore = await captureFile(objectPath);
      const peerBefore = await captureFile(peerPath);
      assert.strictEqual(objectBefore.stats.nlink, 2n);
      assert.strictEqual(peerBefore.stats.dev, objectBefore.stats.dev);
      assert.strictEqual(peerBefore.stats.ino, objectBefore.stats.ino);

      const refused = await expectCurrentError(
        recoverTaskMapRefreshCurrentResidue(
          currentRoot,
          runRoot,
          receipt,
        ),
        "recovery_refused",
      );
      assert.strictEqual(refused.committed, false);
      await assertFilePreserved(objectBefore);
      await assertFilePreserved(peerBefore);
    });
  });

  it("post-commit recovery retains the exact generation hardlink peer", async () => {
    await withStores(async ({ currentRoot, runRoot }) => {
      const fixture = genesisCompleteFixture("postcommit-recovery");
      await materializeFixture(runRoot, fixture);
      const interrupted = await expectCurrentError(
        publishTaskMapRefreshRunCurrent({
          currentRoot,
          runRoot,
          bundleId: fixture.prepared.bundleId,
          expectedGeneration: ZERO_GENERATION,
          options: {
            operationToken: PRIMARY_OPERATION_TOKEN,
            faultInjection(point) {
              if (point === "after_generation_link") {
                throw new Error("stop after generation CAS");
              }
            },
          },
        }),
        "write_failed",
      );
      assert.strictEqual(interrupted.committed, true);
      const receipt = interrupted.recoveryReceipt;
      assert.ok(receipt);
      assert.strictEqual(
        await recoverTaskMapRefreshCurrentResidue(
          currentRoot,
          runRoot,
          receipt,
        ),
        "already_complete",
      );

      const objectPath = path.join(
        currentRoot,
        "objects",
        receipt.objectName,
      );
      const generationPath = path.join(
        currentRoot,
        "generations",
        `${FIRST_GENERATION}.ref`,
      );
      const object = await captureFile(objectPath);
      const generation = await captureFile(generationPath);
      assert.strictEqual(object.stats.nlink, 2n);
      assert.strictEqual(generation.stats.nlink, 2n);
      assert.strictEqual(generation.stats.dev, object.stats.dev);
      assert.strictEqual(generation.stats.ino, object.stats.ino);
      assert.deepStrictEqual(generation.bytes, object.bytes);
      assert.strictEqual(
        object.bytes.toString("utf8"),
        taskMapContractCanonicalJson(receipt.ref),
      );
      const snapshot = await readTaskMapRefreshCurrent(
        currentRoot,
        runRoot,
      );
      assert.strictEqual(snapshot.status, "healthy");
      assert.strictEqual(snapshot.generations.length, 1);
      assert.strictEqual(snapshot.head?.refId, receipt.refId);
    });
  });

  it("preserves committed and recovery-receipt context across ordinary filesystem failures", async () => {
    await withStores(async ({ currentRoot, runRoot }) => {
      const fixture = genesisCompleteFixture("postcas-revalidation");
      await materializeFixture(runRoot, fixture);
      const generationsRoot = path.join(currentRoot, "generations");
      let interrupted: TaskMapRefreshCurrentError | undefined;
      try {
        interrupted = await expectCurrentError(
          publishTaskMapRefreshRunCurrent({
            currentRoot,
            runRoot,
            bundleId: fixture.prepared.bundleId,
            expectedGeneration: ZERO_GENERATION,
            options: {
              operationToken: PRIMARY_OPERATION_TOKEN,
              async faultInjection(point) {
                if (point === "after_generation_link") {
                  await chmod(generationsRoot, 0o755);
                }
              },
            },
          }),
          "unsafe_target",
        );
      } finally {
        await chmod(generationsRoot, DIRECTORY_MODE);
      }
      assert.ok(interrupted);
      assert.strictEqual(interrupted.committed, true);
      assert.ok(interrupted.recoveryReceipt);
      const snapshot = await readTaskMapRefreshCurrent(
        currentRoot,
        runRoot,
      );
      assert.strictEqual(snapshot.status, "healthy");
      assert.strictEqual(
        snapshot.head?.refId,
        interrupted.recoveryReceipt.refId,
      );
    });

    await withStores(async ({ parent, currentRoot, runRoot }) => {
      const fixture = genesisCompleteFixture(
        "recovery-entry-permission-context",
      );
      await materializeFixture(runRoot, fixture);
      const interrupted = await expectCurrentError(
        publishTaskMapRefreshRunCurrent({
          currentRoot,
          runRoot,
          bundleId: fixture.prepared.bundleId,
          expectedGeneration: ZERO_GENERATION,
          options: {
            operationToken: PRIMARY_OPERATION_TOKEN,
            faultInjection(point) {
              if (point === "after_generation_link") {
                throw new Error("retain committed recovery receipt");
              }
            },
          },
        }),
        "write_failed",
      );
      assert.strictEqual(interrupted.committed, true);
      const receipt = interrupted.recoveryReceipt;
      assert.ok(receipt);
      const generationBefore = await captureFile(path.join(
        currentRoot,
        "generations",
        `${FIRST_GENERATION}.ref`,
      ));
      const objectBefore = await captureFile(path.join(
        currentRoot,
        "objects",
        receipt.objectName,
      ));
      let recoveryError: TaskMapRefreshCurrentError | undefined;
      try {
        await chmod(currentRoot, 0o755);
        recoveryError = await expectCurrentError(
          recoverTaskMapRefreshCurrentResidue(
            currentRoot,
            runRoot,
            receipt,
          ),
          "invalid_root",
        );
      } finally {
        await chmod(currentRoot, DIRECTORY_MODE);
      }
      assert.ok(recoveryError);
      assert.strictEqual(recoveryError.committed, true);
      assert.deepStrictEqual(recoveryError.recoveryReceipt, receipt);
      const childDirectories = ["objects", "generations"];
      for (let index = 0; index < childDirectories.length; index += 1) {
        const childRoot = path.join(
          currentRoot,
          childDirectories[index],
        );
        let childModeError: TaskMapRefreshCurrentError | undefined;
        try {
          await chmod(childRoot, 0o755);
          childModeError = await expectCurrentError(
            recoverTaskMapRefreshCurrentResidue(
              currentRoot,
              runRoot,
              receipt,
            ),
            "invalid_root",
          );
        } finally {
          await chmod(childRoot, DIRECTORY_MODE);
        }
        assert.ok(childModeError);
        assert.strictEqual(childModeError.committed, true);
        assert.deepStrictEqual(
          childModeError.recoveryReceipt,
          receipt,
        );
      }
      let fileModeError: TaskMapRefreshCurrentError | undefined;
      try {
        await chmod(objectBefore.path, 0o644);
        fileModeError = await expectCurrentError(
          recoverTaskMapRefreshCurrentResidue(
            currentRoot,
            runRoot,
            receipt,
          ),
          "recovery_refused",
        );
      } finally {
        await chmod(objectBefore.path, 0o600);
      }
      assert.ok(fileModeError);
      assert.strictEqual(fileModeError.committed, true);
      assert.deepStrictEqual(fileModeError.recoveryReceipt, receipt);
      const symlinkedRoot = path.join(
        parent,
        "symlinked-recovery-current-root",
      );
      await symlink(currentRoot, symlinkedRoot);
      const symlinkError = await expectCurrentError(
        recoverTaskMapRefreshCurrentResidue(
          symlinkedRoot,
          runRoot,
          receipt,
        ),
        "invalid_root",
      );
      assert.strictEqual(symlinkError.committed, false);
      assert.deepStrictEqual(symlinkError.recoveryReceipt, receipt);

      const fakeRoot = path.join(parent, "fake-recovery-current-root");
      const fakeObjects = path.join(fakeRoot, "objects");
      const fakeGenerations = path.join(fakeRoot, "generations");
      await mkdir(fakeRoot, { mode: 0o755 });
      await chmod(fakeRoot, 0o755);
      await Promise.all([
        mkdir(fakeObjects, { mode: DIRECTORY_MODE }),
        mkdir(fakeGenerations, { mode: DIRECTORY_MODE }),
        mkdir(path.join(fakeRoot, "reservations"), {
          mode: DIRECTORY_MODE,
        }),
      ]);
      const fakeObjectPath = path.join(
        fakeObjects,
        receipt.objectName,
      );
      const fakeGenerationPath = path.join(
        fakeGenerations,
        `${FIRST_GENERATION}.ref`,
      );
      await link(objectBefore.path, fakeObjectPath);
      await link(objectBefore.path, fakeGenerationPath);
      await unlink(objectBefore.path);
      await unlink(generationBefore.path);
      try {
        const fakeRootError = await expectCurrentError(
          recoverTaskMapRefreshCurrentResidue(
            fakeRoot,
            runRoot,
            receipt,
          ),
          "invalid_root",
        );
        assert.strictEqual(fakeRootError.committed, false);
        assert.deepStrictEqual(fakeRootError.recoveryReceipt, receipt);
      } finally {
        await link(fakeObjectPath, objectBefore.path);
        await link(fakeObjectPath, generationBefore.path);
        await unlink(fakeObjectPath);
        await unlink(fakeGenerationPath);
      }
      await Promise.all([
        assertFilePreserved(generationBefore),
        assertFilePreserved(objectBefore),
      ]);
      const snapshot = await readTaskMapRefreshCurrent(
        currentRoot,
        runRoot,
      );
      assert.strictEqual(snapshot.status, "healthy");
      assert.strictEqual(snapshot.head?.refId, receipt.refId);
    });

    await withStores(async ({ currentRoot, runRoot }) => {
      const fixture = genesisCompleteFixture("precas-receipt");
      await materializeFixture(runRoot, fixture);
      const objectsRoot = path.join(currentRoot, "objects");
      let interrupted: TaskMapRefreshCurrentError | undefined;
      try {
        interrupted = await expectCurrentError(
          publishTaskMapRefreshRunCurrent({
            currentRoot,
            runRoot,
            bundleId: fixture.prepared.bundleId,
            expectedGeneration: ZERO_GENERATION,
            options: {
              operationToken: PRIMARY_OPERATION_TOKEN,
              async faultInjection(point) {
                if (point === "after_object_link") {
                  await chmod(objectsRoot, 0o755);
                }
              },
            },
          }),
          "write_failed",
        );
      } finally {
        await chmod(objectsRoot, DIRECTORY_MODE);
      }
      assert.ok(interrupted);
      assert.strictEqual(interrupted.committed, false);
      const receipt = interrupted.recoveryReceipt;
      assert.ok(receipt);
      assert.strictEqual(receipt.operationToken, PRIMARY_OPERATION_TOKEN);
      assert.strictEqual(
        await recoverTaskMapRefreshCurrentResidue(
          currentRoot,
          runRoot,
          receipt,
        ),
        "already_complete",
      );
      const retry = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: fixture.prepared.bundleId,
        expectedGeneration: ZERO_GENERATION,
        options: { operationToken: PRIMARY_OPERATION_TOKEN },
      });
      assert.strictEqual(retry.status, "published");
      assert.strictEqual(retry.ref.refId, receipt.refId);
    });
  });

  it("preserves committed receipt context when immutable run history blocks semantic recovery", async () => {
    await withStores(async ({ currentRoot, runRoot }) => {
      const fixture = genesisCompleteFixture(
        "committed-bundle-mode-degradation",
      );
      await materializeFixture(runRoot, fixture);
      const interrupted = await expectCurrentError(
        publishTaskMapRefreshRunCurrent({
          currentRoot,
          runRoot,
          bundleId: fixture.prepared.bundleId,
          expectedGeneration: ZERO_GENERATION,
          options: {
            operationToken: PRIMARY_OPERATION_TOKEN,
            faultInjection(point) {
              if (point === "after_generation_link") {
                throw new Error(
                  "retain committed receipt before semantic degradation",
                );
              }
            },
          },
        }),
        "write_failed",
      );
      assert.strictEqual(interrupted.committed, true);
      const receipt = interrupted.recoveryReceipt;
      assert.ok(receipt);
      const objectPath = path.join(
        currentRoot,
        "objects",
        receipt.objectName,
      );
      const generationPath = path.join(
        currentRoot,
        "generations",
        `${FIRST_GENERATION}.ref`,
      );
      const objectBefore = await captureFile(objectPath);
      const generationBefore = await captureFile(generationPath);
      assert.strictEqual(objectBefore.stats.nlink, 2n);
      assert.strictEqual(generationBefore.stats.nlink, 2n);
      assert.strictEqual(
        objectBefore.stats.dev,
        generationBefore.stats.dev,
      );
      assert.strictEqual(
        objectBefore.stats.ino,
        generationBefore.stats.ino,
      );
      assert.deepStrictEqual(objectBefore.bytes, generationBefore.bytes);

      const bundlePath = path.join(
        runRoot,
        fixture.prepared.bundleId,
      );
      let refusal: TaskMapRefreshCurrentError | undefined;
      try {
        await chmod(bundlePath, 0o755);
        refusal = await expectCurrentError(
          recoverTaskMapRefreshCurrentResidue(
            currentRoot,
            runRoot,
            receipt,
          ),
          "recovery_refused",
        );
      } finally {
        await chmod(bundlePath, DIRECTORY_MODE);
      }
      assert.ok(refusal);
      assert.strictEqual(refusal.committed, true);
      assert.deepStrictEqual(refusal.recoveryReceipt, receipt);
      await assertFilePreserved(objectBefore);
      await assertFilePreserved(generationBefore);
      const reopened = await readTaskMapRefreshCurrent(
        currentRoot,
        runRoot,
      );
      assert.strictEqual(reopened.status, "healthy");
      assert.strictEqual(reopened.generations.length, 1);
      assert.strictEqual(reopened.head?.refId, receipt.refId);
    });
  });

  it("preserves committed receipt context when an exact reservation journal is missing or corrupt", async () => {
    const cases: Array<{
      label: string;
      journalName: string;
      mutate: (journalPath: string) => Promise<void>;
    }> = [
      {
        label: "missing-identity",
        journalName: `${FIRST_GENERATION}.identity`,
        mutate: async (journalPath) => {
          await unlink(journalPath);
        },
      },
      {
        label: "corrupt-claim",
        journalName: `${FIRST_GENERATION}.claim`,
        mutate: async (journalPath) => {
          await unlink(journalPath);
          await symlink("{not-a-reservation-claim", journalPath);
        },
      },
    ];
    for (let index = 0; index < cases.length; index += 1) {
      const journalCase = cases[index];
      await withStores(async ({ currentRoot, runRoot }) => {
        const fixture = genesisCompleteFixture(
          `committed-${journalCase.label}`,
        );
        await materializeFixture(runRoot, fixture);
        const interrupted = await expectCurrentError(
          publishTaskMapRefreshRunCurrent({
            currentRoot,
            runRoot,
            bundleId: fixture.prepared.bundleId,
            expectedGeneration: ZERO_GENERATION,
            options: {
              operationToken: PRIMARY_OPERATION_TOKEN,
              faultInjection(point) {
                if (point === "after_generation_link") {
                  throw new Error(
                    `retain committed receipt before ${journalCase.label}`,
                  );
                }
              },
            },
          }),
          "write_failed",
        );
        assert.strictEqual(interrupted.committed, true);
        const receipt = interrupted.recoveryReceipt;
        assert.ok(receipt);
        assert.strictEqual(
          Object.getPrototypeOf(receipt),
          Object.prototype,
        );
        const objectPath = path.join(
          currentRoot,
          "objects",
          receipt.objectName,
        );
        const generationPath = path.join(
          currentRoot,
          "generations",
          `${FIRST_GENERATION}.ref`,
        );
        const objectBefore = await captureFile(objectPath);
        const generationBefore = await captureFile(generationPath);
        assert.strictEqual(objectBefore.stats.nlink, 2n);
        assert.strictEqual(generationBefore.stats.nlink, 2n);
        assert.strictEqual(
          objectBefore.stats.dev,
          generationBefore.stats.dev,
        );
        assert.strictEqual(
          objectBefore.stats.ino,
          generationBefore.stats.ino,
        );
        assert.deepStrictEqual(
          objectBefore.bytes,
          generationBefore.bytes,
        );

        await journalCase.mutate(path.join(
          currentRoot,
          "reservations",
          journalCase.journalName,
        ));
        const refusal = await expectCurrentError(
          recoverTaskMapRefreshCurrentResidue(
            currentRoot,
            runRoot,
            receipt,
          ),
          "recovery_refused",
        );
        assert.strictEqual(refusal.committed, true);
        assert.deepStrictEqual(refusal.recoveryReceipt, receipt);
        await assertFilePreserved(objectBefore);
        await assertFilePreserved(generationBefore);
      });
    }
  });

  it("converges a release-gated recovery raced with exact same-ref publication", async () => {
    await withStores(async ({ currentRoot, runRoot }) => {
      const fixture = genesisCompleteFixture("recover-publish-race");
      await materializeFixture(runRoot, fixture);
      const interrupted = await expectCurrentError(
        publishTaskMapRefreshRunCurrent({
          currentRoot,
          runRoot,
          bundleId: fixture.prepared.bundleId,
          expectedGeneration: ZERO_GENERATION,
          options: {
            operationToken: PRIMARY_OPERATION_TOKEN,
            faultInjection(point) {
              if (point === "after_object_partial_write") {
                throw new Error("seed precommit partial residue");
              }
            },
          },
        }),
        "write_failed",
      );
      const receipt = interrupted.recoveryReceipt;
      assert.ok(receipt);
      assert.strictEqual(interrupted.committed, false);
      const objectPath = path.join(
        currentRoot,
        "objects",
        receipt.objectName,
      );
      const partial = await lstat(objectPath, { bigint: true });
      assert.strictEqual(partial.nlink, 1n);
      assert.ok(partial.size > 0n);
      assert.ok(partial.size < BigInt(receipt.byteLength));

      let releasePublish!: () => void;
      const release = new Promise<void>((resolve) => {
        releasePublish = resolve;
      });
      let publishReady!: () => void;
      const ready = new Promise<void>((resolve) => {
        publishReady = resolve;
      });
      const exactPublish = publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: fixture.prepared.bundleId,
        expectedGeneration: ZERO_GENERATION,
        options: {
          operationToken: PRIMARY_OPERATION_TOKEN,
          async faultInjection(point) {
            if (point === "after_stage_create") {
              publishReady();
              await release;
            }
          },
        },
      });
      await Promise.race([
        ready,
        exactPublish.then(
          () => {
            throw new Error("exact publish passed the release gate");
          },
          (error: unknown) => {
            throw error;
          },
        ),
      ]);
      const concurrentRecovery = recoverTaskMapRefreshCurrentResidue(
        currentRoot,
        runRoot,
        receipt,
      );
      releasePublish();
      const [publishOutcome, recoveryOutcome] = await Promise.allSettled([
        exactPublish,
        concurrentRecovery,
      ]);

      if (publishOutcome.status === "rejected") {
        assert.ok(
          publishOutcome.reason instanceof TaskMapRefreshCurrentError,
        );
        assert.notStrictEqual(
          publishOutcome.reason.code,
          "unsafe_target",
        );
        assert.strictEqual(publishOutcome.reason.committed, true);
      } else {
        assert.ok(
          ["published", "already_current"].includes(
            publishOutcome.value.status,
          ),
        );
        assert.strictEqual(publishOutcome.value.ref.refId, receipt.refId);
      }
      if (recoveryOutcome.status === "rejected") {
        assert.ok(
          recoveryOutcome.reason instanceof TaskMapRefreshCurrentError,
        );
        assert.notStrictEqual(
          recoveryOutcome.reason.code,
          "unsafe_target",
        );
        assert.strictEqual(recoveryOutcome.reason.committed, true);
        assert.strictEqual(
          recoveryOutcome.reason.recoveryReceipt?.refId,
          receipt.refId,
        );
      } else {
        assert.ok(
          ["recovered", "already_complete"].includes(
            recoveryOutcome.value,
          ),
        );
      }

      const snapshot = await readTaskMapRefreshCurrent(
        currentRoot,
        runRoot,
      );
      assert.strictEqual(snapshot.status, "healthy");
      assert.strictEqual(snapshot.generations.length, 1);
      assert.strictEqual(snapshot.head?.refId, receipt.refId);
      const generationPath = path.join(
        currentRoot,
        "generations",
        `${FIRST_GENERATION}.ref`,
      );
      const object = await captureFile(objectPath);
      const generation = await captureFile(generationPath);
      assert.strictEqual(object.stats.nlink, 2n);
      assert.strictEqual(generation.stats.nlink, 2n);
      assert.strictEqual(generation.stats.dev, object.stats.dev);
      assert.strictEqual(generation.stats.ino, object.stats.ino);
      assert.deepStrictEqual(generation.bytes, object.bytes);
      assert.strictEqual(
        object.bytes.toString("utf8"),
        taskMapContractCanonicalJson(receipt.ref),
      );
    });
  });

  it("recovers an exact committed receipt idempotently after a newer healthy generation", async () => {
    await withStores(async ({ currentRoot, runRoot }) => {
      const firstFixture = genesisCompleteFixture(
        "historical-recovery-receipt",
      );
      const upgrade = adapterUpgradeFixture(firstFixture);
      await materializeFixture(runRoot, firstFixture);
      await materializeFixture(runRoot, upgrade);
      const interrupted = await expectCurrentError(
        publishTaskMapRefreshRunCurrent({
          currentRoot,
          runRoot,
          bundleId: firstFixture.prepared.bundleId,
          expectedGeneration: ZERO_GENERATION,
          options: {
            operationToken: PRIMARY_OPERATION_TOKEN,
            faultInjection(point) {
              if (point === "after_generation_link") {
                throw new Error("retain the committed generation-one receipt");
              }
            },
          },
        }),
        "write_failed",
      );
      assert.strictEqual(interrupted.committed, true);
      const receipt = interrupted.recoveryReceipt;
      assert.ok(receipt);
      const second = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: upgrade.prepared.bundleId,
        expectedGeneration: FIRST_GENERATION,
        expectedRefId: receipt.refId,
        options: { operationToken: RETRY_OPERATION_TOKEN },
      });
      assert.strictEqual(second.ref.generation, SECOND_GENERATION);
      const generationOnePath = path.join(
        currentRoot,
        "generations",
        `${FIRST_GENERATION}.ref`,
      );
      const generationTwoPath = path.join(
        currentRoot,
        "generations",
        `${SECOND_GENERATION}.ref`,
      );
      const generationOneBefore = await captureFile(generationOnePath);
      const generationTwoBefore = await captureFile(generationTwoPath);

      for (let attempt = 0; attempt < 2; attempt += 1) {
        let result: Awaited<
          ReturnType<typeof recoverTaskMapRefreshCurrentResidue>
        >;
        try {
          result = await recoverTaskMapRefreshCurrentResidue(
            currentRoot,
            runRoot,
            receipt,
          );
        } catch (error) {
          assert.ok(error instanceof TaskMapRefreshCurrentError);
          assert.strictEqual(error.committed, true);
          assert.deepStrictEqual(error.recoveryReceipt, receipt);
          throw error;
        }
        assert.strictEqual(result, "already_complete");
      }

      await assertFilePreserved(generationOneBefore);
      await assertFilePreserved(generationTwoBefore);
      const snapshot = await readTaskMapRefreshCurrent(
        currentRoot,
        runRoot,
      );
      assert.strictEqual(snapshot.status, "healthy");
      assert.strictEqual(snapshot.generations.length, 2);
      assert.strictEqual(
        snapshot.generations[0].refId,
        receipt.refId,
      );
      assert.strictEqual(snapshot.head?.refId, second.ref.refId);
    });
  });

  it("rejects coercible recovery receipt identity leaves without executing them or touching residue", async () => {
    await withStores(async ({ currentRoot, runRoot }) => {
      const fixture = genesisCompleteFixture(
        "coercible-recovery-receipt-identity",
      );
      await materializeFixture(runRoot, fixture);
      const interrupted = await expectCurrentError(
        publishTaskMapRefreshRunCurrent({
          currentRoot,
          runRoot,
          bundleId: fixture.prepared.bundleId,
          expectedGeneration: ZERO_GENERATION,
          options: {
            operationToken: PRIMARY_OPERATION_TOKEN,
            faultInjection(point) {
              if (point === "after_object_partial_write") {
                throw new Error("seed receipt identity coercion residue");
              }
            },
          },
        }),
        "write_failed",
      );
      const receipt = interrupted.recoveryReceipt;
      assert.ok(receipt);
      const objectBefore = await captureFile(path.join(
        currentRoot,
        "objects",
        receipt.objectName,
      ));
      const reservationNamesBefore = await reservationEntries(currentRoot);
      const reservationTargetsBefore = await Promise.all(
        reservationNamesBefore.map((name) => readlink(path.join(
          currentRoot,
          "reservations",
          name,
        ))),
      );
      const objectNamesBefore = await readdir(
        path.join(currentRoot, "objects"),
      );

      for (const field of [
        "operationToken",
        "rootDev",
        "rootIno",
        "dev",
        "ino",
      ] as const) {
        let coercionCalls = 0;
        const hostile = {
          [Symbol.toPrimitive](): never {
            coercionCalls += 1;
            throw new Error(`recovery receipt ${field} coerced`);
          },
        };
        const candidate = {
          ...receipt,
          [field]: hostile,
        };
        const refusal = await expectCurrentError(
          recoverTaskMapRefreshCurrentResidue(
            currentRoot,
            runRoot,
            candidate as unknown as Parameters<
              typeof recoverTaskMapRefreshCurrentResidue
            >[2],
          ),
          "recovery_refused",
        );
        assert.strictEqual(coercionCalls, 0);
        assert.strictEqual(refusal.committed, false);
      }

      assert.deepStrictEqual(
        await reservationEntries(currentRoot),
        reservationNamesBefore,
      );
      assert.deepStrictEqual(
        await Promise.all(reservationNamesBefore.map((name) => readlink(
          path.join(currentRoot, "reservations", name),
        ))),
        reservationTargetsBefore,
      );
      assert.deepStrictEqual(
        await readdir(path.join(currentRoot, "objects")),
        objectNamesBefore,
      );
      assert.deepStrictEqual(
        await readdir(path.join(currentRoot, "generations")),
        [],
      );
      await assertFilePreserved(objectBefore);
    });
  });

  it("never executes poisoned Array.prototype.some or admits extra hardlinks", async () => {
    await withStores(async ({ currentRoot, runRoot }) => {
      const fixture = genesisCompleteFixture("poisoned-some-write");
      await materializeFixture(runRoot, fixture);
      const interrupted = await expectCurrentError(
        publishTaskMapRefreshRunCurrent({
          currentRoot,
          runRoot,
          bundleId: fixture.prepared.bundleId,
          expectedGeneration: ZERO_GENERATION,
          options: {
            operationToken: PRIMARY_OPERATION_TOKEN,
            faultInjection(point) {
              if (point === "after_object_partial_write") {
                throw new Error("seed a partial object for poisoned recovery");
              }
            },
          },
        }),
        "write_failed",
      );
      const receipt = interrupted.recoveryReceipt;
      assert.ok(receipt);
      const originalSome = Object.getOwnPropertyDescriptor(
        Array.prototype,
        "some",
      )!;
      let someCalls = 0;
      Object.defineProperty(Array.prototype, "some", {
        ...originalSome,
        value(): boolean {
          someCalls += 1;
          return true;
        },
      });
      let recovered:
        | Awaited<ReturnType<typeof recoverTaskMapRefreshCurrentResidue>>
        | undefined;
      let published:
        | Awaited<ReturnType<typeof publishTaskMapRefreshRunCurrent>>
        | undefined;
      try {
        recovered = await recoverTaskMapRefreshCurrentResidue(
          currentRoot,
          runRoot,
          receipt,
        );
      } finally {
        Object.defineProperty(Array.prototype, "some", originalSome);
      }
      assert.strictEqual(someCalls, 0);
      assert.strictEqual(recovered, "recovered");
      published = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: fixture.prepared.bundleId,
        expectedGeneration: ZERO_GENERATION,
        options: { operationToken: PRIMARY_OPERATION_TOKEN },
      });
      assert.strictEqual(published?.status, "published");
      const objectPath = path.join(
        currentRoot,
        "objects",
        receipt.objectName,
      );
      const generationPath = path.join(
        currentRoot,
        "generations",
        `${FIRST_GENERATION}.ref`,
      );
      const object = await captureFile(objectPath);
      const generation = await captureFile(generationPath);
      assert.strictEqual(object.stats.nlink, 2n);
      assert.strictEqual(generation.stats.dev, object.stats.dev);
      assert.strictEqual(generation.stats.ino, object.stats.ino);
      assert.deepStrictEqual(
        await readdir(path.join(currentRoot, "generations")),
        [`${FIRST_GENERATION}.ref`],
      );
    });

    await withStores(async ({ parent, currentRoot, runRoot }) => {
      const fixture = genesisCompleteFixture("poisoned-some-bypass");
      await materializeFixture(runRoot, fixture);
      const interrupted = await expectCurrentError(
        publishTaskMapRefreshRunCurrent({
          currentRoot,
          runRoot,
          bundleId: fixture.prepared.bundleId,
          expectedGeneration: ZERO_GENERATION,
          options: {
            operationToken: PRIMARY_OPERATION_TOKEN,
            faultInjection(point) {
              if (point === "after_stage_create") {
                throw new Error("seed an unwritten object for link bypass");
              }
            },
          },
        }),
        "write_failed",
      );
      const receipt = interrupted.recoveryReceipt;
      assert.ok(receipt);
      const objectPath = path.join(
        currentRoot,
        "objects",
        receipt.objectName,
      );
      const peerOnePath = path.join(parent, "poisoned-some-peer-one.bin");
      const peerTwoPath = path.join(parent, "poisoned-some-peer-two.bin");
      await link(objectPath, peerOnePath);
      await link(objectPath, peerTwoPath);
      const objectBefore = await captureFile(objectPath);
      const peerOneBefore = await captureFile(peerOnePath);
      const peerTwoBefore = await captureFile(peerTwoPath);
      assert.strictEqual(objectBefore.stats.nlink, 3n);

      const originalSome = Object.getOwnPropertyDescriptor(
        Array.prototype,
        "some",
      )!;
      let someCalls = 0;
      Object.defineProperty(Array.prototype, "some", {
        ...originalSome,
        value(): boolean {
          someCalls += 1;
          return true;
        },
      });
      let refusal: unknown;
      try {
        await recoverTaskMapRefreshCurrentResidue(
          currentRoot,
          runRoot,
          receipt,
        );
      } catch (error) {
        refusal = error;
      } finally {
        Object.defineProperty(Array.prototype, "some", originalSome);
      }
      assert.strictEqual(someCalls, 0);
      assert.ok(refusal instanceof TaskMapRefreshCurrentError);
      assert.strictEqual(refusal.code, "recovery_refused");
      assert.strictEqual(refusal.committed, false);
      await assertFilePreserved(objectBefore);
      await assertFilePreserved(peerOneBefore);
      await assertFilePreserved(peerTwoBefore);
      assert.deepStrictEqual(
        await readdir(path.join(currentRoot, "generations")),
        [],
      );
    });
  });
});
