import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import {
  advanceTaskMapConnectorCheckpoint,
  assertTaskMapConnectorCheckpoint,
  assertTaskMapSourceSnapshot,
  buildTaskMapSourceEnvelope,
  buildTaskMapSourceSnapshot,
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "../src/engine/taskmap/source-contracts.js";
import {
  TASKMAP_REFRESH_LANE_VERSION,
  TASKMAP_REFRESH_PLAN_DRAFT_VERSION,
  TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION,
  assertTaskMapReadyBatch,
  buildTaskMapRefreshPlan,
  selectTaskMapReadyBatch,
  type TaskMapRefreshLaneStateV1,
  type TaskMapRefreshPlanDraftV1,
} from "../src/engine/taskmap/refresh-plan.js";
import {
  TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1,
  TaskMapRefreshRunBundleError,
  assertTaskMapRefreshRunBundleByteLimits,
  buildTaskMapRefreshRunSourceSliceProof,
  materializeTaskMapRefreshRunBundle,
  prepareTaskMapRefreshRunBundle,
  verifyTaskMapRefreshRunBundle,
  type PreparedTaskMapRefreshRunBundle,
  type TaskMapRefreshRunCheckpointsV1,
  type TaskMapRefreshRunCommitV1,
  type TaskMapRefreshRunManifestV1,
  type TaskMapRefreshRunSourceSnapshotProofV1,
} from "../src/engine/taskmap/refresh-run-bundle.js";
import type {
  TaskMapConnectorCheckpointV1,
  TaskMapSourceAuthorityBindingV1,
  TaskMapSourceSnapshotV1,
} from "../src/engine/taskmap/types.js";

type JsonRecord = Record<string, unknown>;
type Fixture = ReturnType<typeof syntheticFixture>;

const digest = (label: string): string =>
  taskMapContractDigest(`refresh-run-bundle-test:${label}`);
function recomputeCheckpointId(
  checkpoint: TaskMapConnectorCheckpointV1,
): string {
  const core = {
    binding: checkpoint.binding,
    sourceKind: checkpoint.sourceKind,
    adapterVersion: checkpoint.adapterVersion,
    capabilities: checkpoint.capabilities,
    state: checkpoint.state,
    lastAttemptAt: checkpoint.lastAttemptAt,
    lastSuccessfulPollAt: checkpoint.lastSuccessfulPollAt,
    watermark: checkpoint.watermark,
    watermarkHistoryDigests: checkpoint.watermarkHistoryDigests,
    acceptedSourceIdentityDigests:
      checkpoint.acceptedSourceIdentityDigests,
    error: checkpoint.error,
  };
  return `tmcheckpoint_${taskMapContractDigest(core).slice(0, 16)}`;
}
const OWNER_SCOPE_DIGEST = digest("owner-scope");
const FILE_MODE = 0o600;
const DIRECTORY_MODE = 0o700;
const CLOSED_FILES = [
  "COMMITTED",
  "batch.json",
  "checkpoints.json",
  "manifest.json",
  "plan.json",
  "source-snapshot.json",
] as const;

const BINDINGS: readonly TaskMapSourceAuthorityBindingV1[] = [
  {
    connectionId: "synthetic-strategy-connection",
    sourceKind: "strategy",
    tenantOrWorkspaceDigest: digest("strategy-workspace"),
    accountOrPrincipalDigest: digest("strategy-principal"),
    grantVersion: "synthetic-read-v1",
  },
  {
    connectionId: "synthetic-slack-connection",
    sourceKind: "slack",
    tenantOrWorkspaceDigest: digest("slack-workspace"),
    accountOrPrincipalDigest: digest("slack-principal"),
    grantVersion: "synthetic-read-v1",
  },
] as const;

function revisionSetsFor(
  revisions: TaskMapRefreshPlanDraftV1["sourceRevisions"],
  bindingDigests: readonly string[],
): TaskMapRefreshPlanDraftV1["sourceRevisionSets"] {
  return [...bindingDigests].sort().map((bindingDigest) => ({
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

function sourceSnapshot(
  rawMarker?: string,
): TaskMapSourceSnapshotV1 {
  const envelopes = BINDINGS.map((binding, index) =>
    buildTaskMapSourceEnvelope({
      ownerScopeDigest: OWNER_SCOPE_DIGEST,
      binding,
      sourceKind: binding.sourceKind,
      objectType: "strategy_context",
      sourceObjectId: rawMarker === undefined
        ? `synthetic-source-object-${index}`
        : `${rawMarker}-source-object-${index}`,
      sourceRevision: rawMarker === undefined
        ? `synthetic-source-revision-${index}`
        : `${rawMarker}-source-revision-${index}`,
      eventTime: `2026-07-28T0${index + 1}:00:00.000Z`,
      contentDigest: digest(`source-content-${index}`),
      authority: {
        evidence: "context_only",
        quality: "bounded_context",
        lifecycle: "none",
        completion: "none",
        rank: "context_only",
      },
    })
  );
  return buildTaskMapSourceSnapshot(envelopes, []);
}

function checkpointsFor(
  snapshot: TaskMapSourceSnapshotV1,
): TaskMapConnectorCheckpointV1[] {
  return BINDINGS.map((binding, index) => {
    const bindingDigest = taskMapContractDigest(binding);
    const envelope = snapshot.envelopes.find((candidate) => (
      taskMapContractDigest(candidate.binding) === bindingDigest
    ))!;
    return advanceTaskMapConnectorCheckpoint(null, {
      binding,
      sourceKind: binding.sourceKind,
      adapterVersion: `${binding.sourceKind}-adapter.1`,
      capabilities: ["read_context"],
      state: "success",
      attemptedAt: `2026-07-28T0${index + 3}:00:00.000Z`,
      proposedWatermark: {
        kind: "revision",
        valueDigest: digest(`watermark-${index}`),
        observedThrough: `2026-07-28T0${index + 3}:00:00.000Z`,
      },
      acceptedSourceIdentityDigests: [
        envelope.sourceIdentityDigest,
      ],
    });
  });
}

function lane(
  value: Omit<
    TaskMapRefreshPlanDraftV1["lanes"][number],
    "contractVersion"
  >,
): TaskMapRefreshPlanDraftV1["lanes"][number] {
  return { contractVersion: TASKMAP_REFRESH_LANE_VERSION, ...value };
}

function planDraft(
  snapshot: TaskMapSourceSnapshotV1,
  checkpoints: readonly TaskMapConnectorCheckpointV1[],
): TaskMapRefreshPlanDraftV1 {
  const sourceRevisions = snapshot.envelopes.map((envelope) => ({
    bindingDigest: taskMapContractDigest(envelope.binding),
    sourceIdentityDigest: envelope.sourceIdentityDigest,
    sourceRevisionDigest: taskMapContractDigest(envelope.sourceRevision),
    contentDigest: envelope.contentDigest,
  }));
  const acceptedSourceRevisions = sourceRevisions.map((revision, index) => ({
    ...revision,
    sourceRevisionDigest: digest(`accepted-revision-${index}`),
    contentDigest: digest(`accepted-content-${index}`),
  }));
  const providers = snapshot.envelopes.map((envelope, index) => {
    const bindingDigest = taskMapContractDigest(envelope.binding);
    const checkpoint = checkpoints.find((candidate) => (
      taskMapContractDigest(candidate.binding) === bindingDigest
    ))!;
    const priorSourceSlice = buildTaskMapRefreshRunSourceSliceProof({
      ownerScopeDigest: snapshot.ownerScopeDigest,
      bindingDigest,
      sourceRevisions: acceptedSourceRevisions.filter((revision) => (
        revision.bindingDigest === bindingDigest
      )),
      acceptedSourceIdentityDigests:
        checkpoint.acceptedSourceIdentityDigests,
    });
    return {
      bindingDigest,
      checkpointDigest: taskMapContractDigest(checkpoint),
      sourceSliceDigest: priorSourceSlice.sourceSliceDigest,
      collectLaneId: `collect-${index}`,
      normalizeLaneId: `normalize-${index}`,
      sourceKind: envelope.sourceKind,
    };
  });
  const bindingDigests = providers.map((provider) => provider.bindingDigest);
  const providerLanes = providers.flatMap((provider) => [
    lane({
      laneId: provider.collectLaneId,
      goal: "provider_collect",
      operationVersion: `${provider.sourceKind}-collect.1`,
      priority: "P0",
      priorityReasonCodes: ["source_freshness"],
      predecessorLaneIds: [],
      resourceClaims: [{
        resourceId: `provider:${provider.sourceKind}`,
        mode: "shared",
      }],
      effect: "read_only",
      requiredForPublication: true,
      inputDigests: [
        provider.bindingDigest,
        provider.checkpointDigest,
        provider.sourceSliceDigest,
      ],
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
        resourceId: `normalization:${provider.sourceKind}`,
        mode: "shared",
      }],
      effect: "local_state",
      requiredForPublication: true,
      inputDigests: [
        provider.bindingDigest,
        provider.checkpointDigest,
        provider.sourceSliceDigest,
      ],
      outputKinds: ["normalized_source"],
    }),
  ]);
  return {
    contractVersion: TASKMAP_REFRESH_PLAN_DRAFT_VERSION,
    ownerScopeDigest: snapshot.ownerScopeDigest,
    baseline: {
      kind: "accepted",
      priorCheckpointDigests: providers.map(
        (provider) => provider.checkpointDigest,
      ),
      priorSourceSliceDigests: providers.map(
        (provider) => provider.sourceSliceDigest,
      ),
      priorProviderArtifacts: providers.map((provider) => ({
        bindingDigest: provider.bindingDigest,
        checkpointDigest: provider.checkpointDigest,
        sourceSliceDigest: provider.sourceSliceDigest,
      })),
      priorAcceptedStateDigest: digest("prior-accepted-state"),
      priorOwnerScopeDigest: snapshot.ownerScopeDigest,
      priorSourceSnapshotDigest: digest("prior-source-snapshot"),
      priorReviewedEvidenceDigest: digest("prior-reviewed-evidence"),
      priorPolicyBundleDigest: taskMapContractDigest(policyBindings()),
      priorSemanticImplementationDigest: digest(
        "prior-semantic-implementation",
      ),
      acceptedSourceRevisions,
      acceptedSourceRevisionSets: revisionSetsFor(
        acceptedSourceRevisions,
        bindingDigests,
      ),
      acceptedSemanticInputDigests: [digest("prior-semantic-input")],
      acceptedDeterministicReplayDigest: digest("prior-replay"),
    },
    reviewedDigests: {
      truthSetDigest: digest("truth-set"),
      reviewBatchDigest: digest("review-batch"),
      reviewAttestationVersion:
        TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION,
      reviewAttestationDigest: digest("review-attestation"),
      sourceManifestDigest: digest("source-manifest"),
    },
    sourceBindings: snapshot.envelopes.map((envelope) => ({
      bindingDigest: taskMapContractDigest(envelope.binding),
      sourceKind: envelope.sourceKind,
      sourceContractVersion: envelope.contractVersion,
      adapterVersion: `${envelope.sourceKind}-adapter.1`,
    })),
    sourceRevisions,
    sourceRevisionSets: revisionSetsFor(sourceRevisions, bindingDigests),
    semanticInputDigests: [snapshot.semanticInputDigest],
    deterministicReplayDigest: digest("current-replay"),
    policyBindings: policyBindings(),
    lanes: [
      ...providerLanes,
      lane({
        laneId: "identity-barrier",
        goal: "identity_dedupe_barrier",
        operationVersion: "identity-barrier.1",
        priority: "P0",
        priorityReasonCodes: ["identity_integrity"],
        predecessorLaneIds: providers.map(
          (provider) => provider.normalizeLaneId,
        ),
        resourceClaims: [{
          resourceId: "taskmap:identity",
          mode: "exclusive",
        }],
        effect: "local_state",
        requiredForPublication: true,
        inputDigests: [snapshot.semanticInputDigest],
        outputKinds: ["identity_set"],
      }),
      lane({
        laneId: "deterministic-gate",
        goal: "deterministic_gate",
        operationVersion: "deterministic-gate.1",
        priority: "P0",
        priorityReasonCodes: ["deterministic_replay"],
        predecessorLaneIds: ["identity-barrier"],
        resourceClaims: [{
          resourceId: "taskmap:deterministic-gate",
          mode: "shared",
        }],
        effect: "local_state",
        requiredForPublication: true,
        inputDigests: [digest("review-attestation")],
        outputKinds: ["gate_decision"],
      }),
      lane({
        laneId: "taskmap-projection",
        goal: "taskmap_projection",
        operationVersion: "taskmap-projection.1",
        priority: "P0",
        priorityReasonCodes: ["publication_safety"],
        predecessorLaneIds: ["deterministic-gate"],
        resourceClaims: [{
          resourceId: "taskmap:projection",
          mode: "exclusive",
        }],
        effect: "local_state",
        requiredForPublication: true,
        inputDigests: [digest("truth-set")],
        outputKinds: ["taskmap_projection"],
      }),
      lane({
        laneId: "publication",
        goal: "publication",
        operationVersion: "taskmap-publication.1",
        priority: "P0",
        priorityReasonCodes: ["publication_safety"],
        predecessorLaneIds: ["taskmap-projection"],
        resourceClaims: [{
          resourceId: "taskmap:accepted-head",
          mode: "exclusive",
        }],
        effect: "local_state",
        requiredForPublication: true,
        inputDigests: [digest("source-manifest")],
        outputKinds: ["accepted_state"],
      }),
    ],
  };
}

function syntheticFixture(
  includeSourceSnapshot = true,
  snapshot = sourceSnapshot(),
) {
  const checkpoints = checkpointsFor(snapshot);
  const plan = buildTaskMapRefreshPlan(planDraft(snapshot, checkpoints));
  const laneStates: TaskMapRefreshLaneStateV1[] = plan.lanes.map(
    (plannedLane) => ({
      laneId: plannedLane.laneId,
      status: "pending",
    }),
  );
  const batch = selectTaskMapReadyBatch(plan, {
    maxConcurrency: 2,
    laneStates,
  });
  const input = {
    plan,
    batch,
    connectorCheckpoints: [],
    attemptOutputs: [],
    sourceSliceProofs: [],
    ...(includeSourceSnapshot ? { sourceSnapshot: snapshot } : {}),
  };
  return {
    snapshot,
    checkpoints,
    plan,
    batch,
    input,
    prepared: prepareTaskMapRefreshRunBundle(input),
  };
}

function terminalAttemptFixture(
  status: "succeeded" | "partial" | "failed",
) {
  const base = syntheticFixture();
  const collectLanes = base.plan.lanes.filter((plannedLane) => (
    plannedLane.outputKinds.includes("connector_checkpoint")
    && plannedLane.outputKinds.includes("source_slice")
  ));
  const priorByBinding = new Map(
    base.checkpoints.map((checkpoint) => [
      taskMapContractDigest(checkpoint.binding),
      checkpoint,
    ]),
  );
  const artifactByBinding = new Map(
    base.plan.baseline.priorProviderArtifacts.map((artifact) => [
      artifact.bindingDigest,
      artifact,
    ]),
  );
  const attemptCheckpoints = collectLanes.map((plannedLane, index) => {
    const binding = base.plan.sourceBindings.find((candidate) =>
      plannedLane.inputDigests.includes(candidate.bindingDigest)
    )!;
    const prior = priorByBinding.get(binding.bindingDigest)!;
    return advanceTaskMapConnectorCheckpoint(prior, {
      binding: prior.binding,
      sourceKind: prior.sourceKind,
      adapterVersion: prior.adapterVersion,
      capabilities: prior.capabilities,
      state: status === "succeeded" ? "success" : status,
      attemptedAt: `2026-07-28T1${index}:00:00.000Z`,
      ...(status === "succeeded"
        ? {
            proposedWatermark: {
              kind: prior.watermark!.kind,
              valueDigest: digest(`attempt-watermark-${status}-${index}`),
              observedThrough: `2026-07-28T1${index}:00:00.000Z`,
            },
            acceptedSourceIdentityDigests:
              prior.acceptedSourceIdentityDigests,
          }
        : {
            errorCode: status === "partial"
              ? "provider_partial_result"
              : "provider_unavailable",
            errorDetailDigest: digest(`terminal-error-${status}-${index}`),
          }),
    });
  });
  const laneStates: TaskMapRefreshLaneStateV1[] = base.plan.lanes.map(
    (plannedLane) => {
      const collectIndex = collectLanes.findIndex(
        (candidate) => candidate.laneId === plannedLane.laneId,
      );
      if (collectIndex < 0) {
        return { laneId: plannedLane.laneId, status: "pending" };
      }
      if (status === "succeeded") {
        return { laneId: plannedLane.laneId, status };
      }
      const binding = base.plan.sourceBindings.find((candidate) =>
        plannedLane.inputDigests.includes(candidate.bindingDigest)
      )!;
      const priorArtifact = artifactByBinding.get(binding.bindingDigest)!;
      return {
        laneId: plannedLane.laneId,
        status,
        errorCode: status === "partial"
          ? "provider_partial_result"
          : "provider_unavailable",
        errorDetailDigest: digest(
          `terminal-error-${status}-${collectIndex}`,
        ),
        lastGoodCheckpointDigest: priorArtifact.checkpointDigest,
        lastGoodSourceSliceDigest: priorArtifact.sourceSliceDigest,
      };
    },
  );
  const batch = selectTaskMapReadyBatch(base.plan, {
    maxConcurrency: 2,
    laneStates,
  });
  const retainedSourceSlices = status === "succeeded"
    ? []
    : base.plan.sourceBindings.map((binding) => {
        const prior = priorByBinding.get(binding.bindingDigest)!;
        return buildTaskMapRefreshRunSourceSliceProof({
          ownerScopeDigest: base.plan.ownerScopeDigest,
          bindingDigest: binding.bindingDigest,
          sourceRevisions:
            base.plan.baseline.acceptedSourceRevisions.filter(
              (revision) => (
                revision.bindingDigest === binding.bindingDigest
              ),
            ),
          acceptedSourceIdentityDigests:
            prior.acceptedSourceIdentityDigests,
        });
      });
  const attemptSourceSlices = collectLanes.map((plannedLane, index) => {
    const binding = base.plan.sourceBindings.find((candidate) =>
      plannedLane.inputDigests.includes(candidate.bindingDigest)
    )!;
    if (status !== "succeeded") {
      return retainedSourceSlices.find((proof) => (
        proof.bindingDigest === binding.bindingDigest
      ))!;
    }
    return buildTaskMapRefreshRunSourceSliceProof({
      ownerScopeDigest: base.plan.ownerScopeDigest,
      bindingDigest: binding.bindingDigest,
      sourceRevisions: base.plan.sourceRevisions.filter((revision) => (
        revision.bindingDigest === binding.bindingDigest
      )),
      acceptedSourceIdentityDigests:
        attemptCheckpoints[index].acceptedSourceIdentityDigests,
    });
  });
  const attemptOutputs = collectLanes.map((plannedLane, index) => ({
    laneId: plannedLane.laneId,
    checkpointDigest: taskMapContractDigest(attemptCheckpoints[index]),
    sourceSliceDigest: attemptSourceSlices[index].sourceSliceDigest,
  }));
  const connectorCheckpoints = status === "succeeded"
    ? attemptCheckpoints
    : [...base.checkpoints, ...attemptCheckpoints];
  const sourceSliceProofs = status === "succeeded"
    ? attemptSourceSlices
    : retainedSourceSlices;
  const input = {
    plan: base.plan,
    batch,
    connectorCheckpoints,
    attemptOutputs,
    sourceSliceProofs,
    sourceSnapshot: base.snapshot,
  };
  return {
    ...base,
    batch,
    connectorCheckpoints,
    attemptCheckpoints,
    attemptOutputs,
    sourceSliceProofs,
    input,
    prepared: prepareTaskMapRefreshRunBundle(input),
  };
}

function terminalWithoutPriorArtifactFixture(
  status: "partial" | "failed",
  baselineKind: "genesis" | "accepted_new_binding",
) {
  const snapshot = sourceSnapshot();
  const priorCheckpoints = checkpointsFor(snapshot);
  const draft = planDraft(snapshot, priorCheckpoints);
  const originalArtifacts = [
    ...draft.baseline.priorProviderArtifacts,
  ];
  const missingBindingDigests = new Set(
    baselineKind === "genesis"
      ? draft.sourceBindings.map((binding) => binding.bindingDigest)
      : [draft.sourceBindings[0].bindingDigest],
  );
  const removedArtifacts = originalArtifacts.filter((artifact) => (
    missingBindingDigests.has(artifact.bindingDigest)
  ));
  const removedInputDigests = new Set(removedArtifacts.flatMap((artifact) => [
    artifact.checkpointDigest,
    artifact.sourceSliceDigest,
  ]));
  for (const plannedLane of draft.lanes) {
    if (
      plannedLane.inputDigests.some((inputDigest) => (
        missingBindingDigests.has(inputDigest)
      ))
    ) {
      plannedLane.inputDigests = plannedLane.inputDigests.filter(
        (inputDigest) => !removedInputDigests.has(inputDigest),
      );
    }
  }
  if (baselineKind === "genesis") {
    draft.baseline = {
      kind: "genesis",
      priorCheckpointDigests: [],
      priorSourceSliceDigests: [],
      priorProviderArtifacts: [],
      acceptedSourceRevisions: [],
      acceptedSourceRevisionSets: [],
      acceptedSemanticInputDigests: [],
    };
  } else {
    draft.baseline.priorCheckpointDigests =
      draft.baseline.priorCheckpointDigests.filter((digestValue) => (
        !removedArtifacts.some(
          (artifact) => artifact.checkpointDigest === digestValue,
        )
      ));
    draft.baseline.priorSourceSliceDigests =
      draft.baseline.priorSourceSliceDigests.filter((digestValue) => (
        !removedArtifacts.some(
          (artifact) => artifact.sourceSliceDigest === digestValue,
        )
      ));
    draft.baseline.priorProviderArtifacts =
      draft.baseline.priorProviderArtifacts.filter((artifact) => (
        !missingBindingDigests.has(artifact.bindingDigest)
      ));
    draft.baseline.acceptedSourceRevisions =
      draft.baseline.acceptedSourceRevisions.filter((revision) => (
        !missingBindingDigests.has(revision.bindingDigest)
      ));
    draft.baseline.acceptedSourceRevisionSets =
      draft.baseline.acceptedSourceRevisionSets.filter((revisionSet) => (
        !missingBindingDigests.has(revisionSet.bindingDigest)
      ));
  }
  const plan = buildTaskMapRefreshPlan(draft);
  const collectLanes = plan.lanes.filter((plannedLane) => (
    plannedLane.goal === "provider_collect"
    && plannedLane.inputDigests.some((inputDigest) => (
      missingBindingDigests.has(inputDigest)
    ))
  ));
  const checkpointByBinding = new Map(priorCheckpoints.map((checkpoint) => [
    taskMapContractDigest(checkpoint.binding),
    checkpoint,
  ]));
  const attemptCheckpoints = collectLanes.map((plannedLane, index) => {
    const binding = plan.sourceBindings.find((candidate) => (
      plannedLane.inputDigests.includes(candidate.bindingDigest)
    ))!;
    const lineage = checkpointByBinding.get(binding.bindingDigest)!;
    return advanceTaskMapConnectorCheckpoint(null, {
      binding: lineage.binding,
      sourceKind: lineage.sourceKind,
      adapterVersion: lineage.adapterVersion,
      capabilities: lineage.capabilities,
      state: status,
      attemptedAt: `2026-07-28T2${index}:00:00.000Z`,
      errorCode: status === "partial"
        ? "provider_partial_result"
        : "provider_unavailable",
      errorDetailDigest: digest(
        `${baselineKind}-${status}-terminal-error-${index}`,
      ),
    });
  });
  const laneStates: TaskMapRefreshLaneStateV1[] = plan.lanes.map(
    (plannedLane) => {
      const collectIndex = collectLanes.findIndex(
        (candidate) => candidate.laneId === plannedLane.laneId,
      );
      if (collectIndex < 0) {
        return { laneId: plannedLane.laneId, status: "pending" };
      }
      return {
        laneId: plannedLane.laneId,
        status,
        errorCode: status === "partial"
          ? "provider_partial_result"
          : "provider_unavailable",
        errorDetailDigest: digest(
          `${baselineKind}-${status}-terminal-error-${collectIndex}`,
        ),
      };
    },
  );
  const batch = selectTaskMapReadyBatch(plan, {
    maxConcurrency: 2,
    laneStates,
  });
  const sourceSliceProofs = collectLanes.map((plannedLane) => {
    const binding = plan.sourceBindings.find((candidate) => (
      plannedLane.inputDigests.includes(candidate.bindingDigest)
    ))!;
    return buildTaskMapRefreshRunSourceSliceProof({
      sliceRole: "observed_non_serving",
      ownerScopeDigest: plan.ownerScopeDigest,
      bindingDigest: binding.bindingDigest,
      sourceRevisions: [],
      acceptedSourceIdentityDigests: [],
    });
  });
  const attemptOutputs = collectLanes.map((plannedLane, index) => ({
    laneId: plannedLane.laneId,
    checkpointDigest: taskMapContractDigest(attemptCheckpoints[index]),
    sourceSliceDigest: sourceSliceProofs[index].sourceSliceDigest,
  }));
  const input = {
    plan,
    batch,
    connectorCheckpoints: attemptCheckpoints,
    attemptOutputs,
    sourceSliceProofs,
    sourceSnapshot: snapshot,
  };
  return {
    snapshot,
    plan,
    batch,
    connectorCheckpoints: attemptCheckpoints,
    attemptOutputs,
    sourceSliceProofs,
    input,
    prepared: prepareTaskMapRefreshRunBundle(input),
  };
}

function successfulEmptyProviderFixture() {
  const snapshot = sourceSnapshot();
  const priorCheckpoints = checkpointsFor(snapshot);
  const draft = planDraft(snapshot, priorCheckpoints);
  const bindingDigest = draft.sourceBindings[0].bindingDigest;
  const removedArtifact = draft.baseline.priorProviderArtifacts.find(
    (artifact) => artifact.bindingDigest === bindingDigest,
  )!;
  draft.baseline.priorCheckpointDigests =
    draft.baseline.priorCheckpointDigests.filter(
      (value) => value !== removedArtifact.checkpointDigest,
    );
  draft.baseline.priorSourceSliceDigests =
    draft.baseline.priorSourceSliceDigests.filter(
      (value) => value !== removedArtifact.sourceSliceDigest,
    );
  draft.baseline.priorProviderArtifacts =
    draft.baseline.priorProviderArtifacts.filter(
      (artifact) => artifact.bindingDigest !== bindingDigest,
    );
  draft.baseline.acceptedSourceRevisions =
    draft.baseline.acceptedSourceRevisions.filter(
      (revision) => revision.bindingDigest !== bindingDigest,
    );
  draft.baseline.acceptedSourceRevisionSets =
    draft.baseline.acceptedSourceRevisionSets.filter(
      (revisionSet) => revisionSet.bindingDigest !== bindingDigest,
    );
  draft.sourceRevisions = draft.sourceRevisions.filter(
    (revision) => revision.bindingDigest !== bindingDigest,
  );
  draft.sourceRevisionSets = revisionSetsFor(
    draft.sourceRevisions,
    draft.sourceBindings.map((binding) => binding.bindingDigest),
  );
  for (const plannedLane of draft.lanes) {
    if (!plannedLane.inputDigests.includes(bindingDigest)) continue;
    plannedLane.inputDigests = plannedLane.inputDigests.filter(
      (value) => (
        value !== removedArtifact.checkpointDigest
        && value !== removedArtifact.sourceSliceDigest
      ),
    );
  }
  const plan = buildTaskMapRefreshPlan(draft);
  const collectLane = plan.lanes.find((plannedLane) => (
    plannedLane.goal === "provider_collect"
    && plannedLane.inputDigests.includes(bindingDigest)
  ))!;
  const priorShape = priorCheckpoints.find((checkpoint) => (
    taskMapContractDigest(checkpoint.binding) === bindingDigest
  ))!;
  const checkpoint = advanceTaskMapConnectorCheckpoint(null, {
    binding: priorShape.binding,
    sourceKind: priorShape.sourceKind,
    adapterVersion: priorShape.adapterVersion,
    capabilities: priorShape.capabilities,
    state: "success",
    attemptedAt: "2026-07-28T22:00:00.000Z",
    proposedWatermark: {
      kind: "revision",
      valueDigest: digest("successful-empty-watermark"),
      observedThrough: "2026-07-28T22:00:00.000Z",
    },
    acceptedSourceIdentityDigests: [],
  });
  const batch = selectTaskMapReadyBatch(plan, {
    maxConcurrency: 2,
    laneStates: plan.lanes.map((plannedLane) => (
      plannedLane.laneId === collectLane.laneId
        ? { laneId: plannedLane.laneId, status: "succeeded" as const }
        : { laneId: plannedLane.laneId, status: "pending" as const }
    )),
  });
  const sourceSlice = buildTaskMapRefreshRunSourceSliceProof({
    ownerScopeDigest: plan.ownerScopeDigest,
    bindingDigest,
    sourceRevisions: [],
    acceptedSourceIdentityDigests: [],
  });
  const input = {
    plan,
    batch,
    connectorCheckpoints: [checkpoint],
    attemptOutputs: [{
      laneId: collectLane.laneId,
      checkpointDigest: taskMapContractDigest(checkpoint),
      sourceSliceDigest: sourceSlice.sourceSliceDigest,
    }],
    sourceSliceProofs: [sourceSlice],
  };
  return {
    plan,
    batch,
    checkpoint,
    sourceSlice,
    input,
    prepared: prepareTaskMapRefreshRunBundle(input),
  };
}

function exactNoOpFixture() {
  const snapshot = sourceSnapshot();
  const checkpoints = checkpointsFor(snapshot);
  const draft = planDraft(snapshot, checkpoints);
  draft.baseline.acceptedSourceRevisions =
    cloneRecord(draft.sourceRevisions);
  draft.baseline.acceptedSourceRevisionSets =
    cloneRecord(draft.sourceRevisionSets);
  draft.baseline.acceptedSemanticInputDigests = [
    ...draft.semanticInputDigests,
  ];
  draft.baseline.acceptedDeterministicReplayDigest =
    draft.deterministicReplayDigest;
  draft.baseline.priorReviewedEvidenceDigest =
    taskMapContractDigest(draft.reviewedDigests);
  draft.baseline.priorPolicyBundleDigest =
    taskMapContractDigest(draft.policyBindings);
  const probe = buildTaskMapRefreshPlan(draft);
  draft.baseline.priorSemanticImplementationDigest =
    probe.semanticImplementationDigest;
  draft.baseline.priorAcceptedStateDigest =
    probe.candidateAcceptedStateDigest;
  const plan = buildTaskMapRefreshPlan(draft);
  const batch = selectTaskMapReadyBatch(plan, {
    maxConcurrency: 2,
    laneStates: plan.lanes.map((plannedLane) => ({
      laneId: plannedLane.laneId,
      status: "pending",
    })),
  });
  const input = {
    plan,
    batch,
    connectorCheckpoints: [],
    attemptOutputs: [],
    sourceSliceProofs: [],
    sourceSnapshot: snapshot,
  };
  return {
    snapshot,
    plan,
    batch,
    input,
    prepared: prepareTaskMapRefreshRunBundle(input),
  };
}

async function withRunRoot<T>(
  callback: (runRoot: string) => Promise<T>,
): Promise<T> {
  const canonicalTmp = await realpath(tmpdir());
  const runRoot = await mkdtemp(
    path.join(canonicalTmp, "taskmap-refresh-run-test-"),
  );
  await chmod(runRoot, DIRECTORY_MODE);
  try {
    return await callback(runRoot);
  } finally {
    await rm(runRoot, { recursive: true, force: true });
  }
}

function mode(value: { mode: number }): number {
  return value.mode & 0o777;
}

function cloneRecord<T>(value: T): T {
  return structuredClone(value);
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function resealCheckpointArtifact(
  prepared: PreparedTaskMapRefreshRunBundle,
  mutate: (artifact: TaskMapRefreshRunCheckpointsV1) => void,
): PreparedTaskMapRefreshRunBundle {
  const forged = cloneRecord(prepared) as unknown as {
    bundleId: string;
    manifest: TaskMapRefreshRunManifestV1;
    commitMarker: TaskMapRefreshRunCommitV1;
    members: Record<string, string>;
  };
  const artifact = JSON.parse(
    forged.members["checkpoints.json"],
  ) as TaskMapRefreshRunCheckpointsV1;
  mutate(artifact);
  artifact.checkpoints.sort((left, right) => (
    left.checkpoint.checkpointId.localeCompare(
      right.checkpoint.checkpointId,
    )
  ));
  artifact.checkpointDigests = artifact.checkpoints
    .map((record) => record.checkpointDigest)
    .sort();
  artifact.sourceSlices.sort((left, right) => (
    left.bindingDigest.localeCompare(right.bindingDigest)
    || left.sourceSliceDigest.localeCompare(right.sourceSliceDigest)
  ));
  artifact.laneReferences.sort((left, right) => (
    left.laneId.localeCompare(right.laneId)
    || left.referenceKind.localeCompare(right.referenceKind)
    || left.checkpointDigest.localeCompare(right.checkpointDigest)
    || left.sourceSliceDigest.localeCompare(right.sourceSliceDigest)
  ));
  const {
    checkpointSetId: _checkpointSetId,
    ...checkpointCore
  } = artifact;
  artifact.checkpointSetId =
    `tmrefreshcheckpoints_${taskMapContractDigest(checkpointCore)}`;
  const checkpointBytes = taskMapContractCanonicalJson(artifact);
  forged.members["checkpoints.json"] = checkpointBytes;

  const descriptor = forged.manifest.members.find(
    (member) => member.fileName === "checkpoints.json",
  )!;
  descriptor.artifactId = artifact.checkpointSetId;
  descriptor.canonicalArtifactDigest = taskMapContractDigest(artifact);
  descriptor.byteSha256 = sha256Text(checkpointBytes);
  descriptor.byteLength = Buffer.byteLength(checkpointBytes, "utf8");
  const {
    bundleId: _bundleId,
    bundleContentDigest: _bundleContentDigest,
    ...manifestCore
  } = forged.manifest;
  const bundleContentDigest = taskMapContractDigest(manifestCore);
  forged.bundleId = `tmrefreshrun_${bundleContentDigest}`;
  forged.manifest.bundleId = forged.bundleId;
  forged.manifest.bundleContentDigest = bundleContentDigest;
  forged.commitMarker.bundleId = forged.bundleId;
  forged.commitMarker.manifestByteSha256 = sha256Text(
    taskMapContractCanonicalJson(forged.manifest),
  );
  return forged;
}

function resealSourceSnapshotProof(
  prepared: PreparedTaskMapRefreshRunBundle,
  mutate: (artifact: TaskMapRefreshRunSourceSnapshotProofV1) => void,
): PreparedTaskMapRefreshRunBundle {
  const forged = cloneRecord(prepared) as unknown as {
    bundleId: string;
    manifest: TaskMapRefreshRunManifestV1;
    commitMarker: TaskMapRefreshRunCommitV1;
    members: Record<string, string>;
  };
  const proof = JSON.parse(
    forged.members["source-snapshot.json"],
  ) as TaskMapRefreshRunSourceSnapshotProofV1;
  mutate(proof);
  const {
    sourceSnapshotProofId: _sourceSnapshotProofId,
    ...proofCore
  } = proof;
  proof.sourceSnapshotProofId =
    `tmrefreshsnapshotproof_${taskMapContractDigest(proofCore)}`;
  const proofBytes = taskMapContractCanonicalJson(proof);
  forged.members["source-snapshot.json"] = proofBytes;
  const descriptor = forged.manifest.members.find(
    (member) => member.fileName === "source-snapshot.json",
  )!;
  descriptor.artifactId = proof.sourceSnapshotProofId;
  descriptor.canonicalArtifactDigest = taskMapContractDigest(proof);
  descriptor.byteSha256 = sha256Text(proofBytes);
  descriptor.byteLength = Buffer.byteLength(proofBytes, "utf8");
  const {
    bundleId: _bundleId,
    bundleContentDigest: _bundleContentDigest,
    ...manifestCore
  } = forged.manifest;
  const bundleContentDigest = taskMapContractDigest(manifestCore);
  forged.bundleId = `tmrefreshrun_${bundleContentDigest}`;
  forged.manifest.bundleId = forged.bundleId;
  forged.manifest.bundleContentDigest = bundleContentDigest;
  forged.commitMarker.bundleId = forged.bundleId;
  forged.commitMarker.manifestByteSha256 = sha256Text(
    taskMapContractCanonicalJson(forged.manifest),
  );
  return forged;
}

async function expectBundleError(
  action: Promise<unknown>,
  codes: readonly TaskMapRefreshRunBundleError["code"][],
): Promise<TaskMapRefreshRunBundleError> {
  let caught: unknown;
  try {
    await action;
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof TaskMapRefreshRunBundleError);
  assert.ok(
    codes.includes(caught.code),
    `unexpected bundle error code ${caught.code}`,
  );
  return caught;
}

async function materialized(
  runRoot: string,
  fixture: Fixture = syntheticFixture(),
): Promise<{ fixture: Fixture; bundleDirectory: string }> {
      const result = await materializeTaskMapRefreshRunBundle(
        runRoot,
        fixture.prepared,
      );
      assert.strictEqual(result.status, "created");
      assert.strictEqual(result.sameUidResidual, false);
  return {
    fixture,
    bundleDirectory: path.join(runRoot, fixture.prepared.bundleId),
  };
}

async function writePreparedBundleUnchecked(
  runRoot: string,
  prepared: PreparedTaskMapRefreshRunBundle,
): Promise<string> {
  const target = path.join(runRoot, prepared.bundleId);
  await mkdir(target, { mode: DIRECTORY_MODE });
  await chmod(target, DIRECTORY_MODE);
  for (const [fileName, bytes] of Object.entries(prepared.members)) {
    await writeFile(path.join(target, fileName), bytes, {
      mode: FILE_MODE,
    });
    await chmod(path.join(target, fileName), FILE_MODE);
  }
  for (const [fileName, bytes] of [
    ["manifest.json", taskMapContractCanonicalJson(prepared.manifest)],
    ["COMMITTED", taskMapContractCanonicalJson(prepared.commitMarker)],
  ] as const) {
    await writeFile(path.join(target, fileName), bytes, {
      mode: FILE_MODE,
    });
    await chmod(path.join(target, fileName), FILE_MODE);
  }
  return target;
}

describe("P10.1B validator seams", () => {
  it("delegates checkpoint and snapshot validation to the frozen builders", () => {
    const fixture = syntheticFixture();
    assert.deepStrictEqual(
      assertTaskMapConnectorCheckpoint(fixture.checkpoints[0]),
      fixture.checkpoints[0],
    );
    assert.deepStrictEqual(
      assertTaskMapSourceSnapshot(fixture.snapshot),
      fixture.snapshot,
    );

    const checkpoint = cloneRecord(
      fixture.checkpoints[0],
    ) as unknown as JsonRecord;
    checkpoint.checkpointId = digest("forged-checkpoint-id");
    assert.throws(
      () => assertTaskMapConnectorCheckpoint(
        checkpoint as unknown as TaskMapConnectorCheckpointV1,
      ),
      /checkpoint|digest|canonical/i,
    );

    const snapshot = cloneRecord(fixture.snapshot) as unknown as JsonRecord;
    snapshot.sourceSnapshotDigest = digest("forged-snapshot-digest");
    assert.throws(
      () => assertTaskMapSourceSnapshot(
        snapshot as unknown as TaskMapSourceSnapshotV1,
      ),
      /snapshot|digest|canonical/i,
    );
  });

  it("rebuilds the ready batch deterministically and rejects tampering", () => {
    const fixture = syntheticFixture();
    assert.deepStrictEqual(
      assertTaskMapReadyBatch(fixture.plan, fixture.batch),
      fixture.batch,
    );
    const forged = cloneRecord(fixture.batch) as unknown as JsonRecord;
    forged.batchId = digest("forged-batch");
    assert.throws(
      () => assertTaskMapReadyBatch(
        fixture.plan,
        forged as unknown as typeof fixture.batch,
      ),
      /batch|canonical|digest/i,
    );
    const unknown = cloneRecord(fixture.batch) as unknown as JsonRecord;
    unknown.fixedNow = "2026-07-28T00:00:00.000Z";
    assert.throws(
      () => assertTaskMapReadyBatch(
        fixture.plan,
        unknown as unknown as typeof fixture.batch,
      ),
      /unknown|field|batch/i,
    );
  });
});

describe("P10.1B pure bundle preparation", () => {
  it("is deterministic across checkpoint permutations", () => {
    const fixture = terminalAttemptFixture("failed");
    const permuted = prepareTaskMapRefreshRunBundle({
      ...fixture.input,
      connectorCheckpoints: [
        ...fixture.connectorCheckpoints,
      ].reverse(),
      attemptOutputs: [...fixture.attemptOutputs].reverse(),
      sourceSliceProofs: [...fixture.sourceSliceProofs].reverse(),
    });
    assert.deepStrictEqual(permuted, fixture.prepared);
    assert.match(fixture.prepared.bundleId, /^tmrefreshrun_[a-f0-9]{64}$/);
    assert.strictEqual(
      fixture.prepared.manifest.bundleContentDigest,
      fixture.prepared.bundleId.slice("tmrefreshrun_".length),
    );
  });

  it("closes success, partial, and failed attempt outputs independently from retained last-good refs", () => {
    for (const status of [
      "succeeded",
      "partial",
      "failed",
    ] as const) {
      const fixture = terminalAttemptFixture(status);
      const bytes = fixture.prepared.members["checkpoints.json"]!;
      const artifact = JSON.parse(bytes) as {
        checkpoints: Array<{ checkpoint: { state: string } }>;
        checkpointDigests: string[];
        sourceSlices: Array<{ sourceSliceDigest: string }>;
        laneReferences: Array<{
          laneId: string;
          referenceKind: string;
          checkpointDigest: string;
          sourceSliceDigest: string;
        }>;
      };
      const attempts = artifact.laneReferences.filter(
        (reference) => reference.referenceKind === "attempt_output",
      );
      const retained = artifact.laneReferences.filter(
        (reference) => reference.referenceKind === "retained_last_good",
      );
      assert.strictEqual(attempts.length, 2);
      assert.strictEqual(
        retained.length,
        status === "succeeded" ? 0 : 2,
      );
      if (status !== "succeeded") {
        assert.strictEqual(fixture.batch.publication.eligible, false);
        assert.strictEqual(fixture.batch.publication.state, "blocked");
        assert.notDeepStrictEqual(
          fixture.plan.sourceRevisions,
          fixture.plan.baseline.acceptedSourceRevisions,
        );
        assert.ok(attempts.every((attempt) => (
          retained.some((lastGood) => (
            lastGood.laneId === attempt.laneId
            && lastGood.sourceSliceDigest === attempt.sourceSliceDigest
            && lastGood.checkpointDigest !== attempt.checkpointDigest
          ))
        )));
      }
      assert.ok(attempts.every((reference) =>
        fixture.attemptOutputs.some((output) => (
          output.checkpointDigest === reference.checkpointDigest
          && output.sourceSliceDigest === reference.sourceSliceDigest
        ))
      ));
      assert.deepStrictEqual(
        artifact.checkpointDigests,
        fixture.connectorCheckpoints
          .map((checkpoint) => taskMapContractDigest(checkpoint))
          .sort(),
      );
      assert.deepStrictEqual(
        artifact.sourceSlices.map((proof) => proof.sourceSliceDigest).sort(),
        fixture.sourceSliceProofs
          .map((proof) => proof.sourceSliceDigest)
          .sort(),
      );
      const expectedState = status === "succeeded" ? "success" : status;
      assert.strictEqual(
        artifact.checkpoints.filter(
          (record) => record.checkpoint.state === expectedState,
        ).length,
        2,
      );
      assert.throws(
        () => prepareTaskMapRefreshRunBundle({
          ...fixture.input,
          connectorCheckpoints: fixture.connectorCheckpoints.slice(1),
        }),
        /checkpoint|resolve|referenc/i,
      );
      const forgedSlice = cloneRecord(
        fixture.sourceSliceProofs[0],
      ) as unknown as JsonRecord;
      forgedSlice.sourceSliceDigest = digest(`forged-slice-${status}`);
      assert.throws(
        () => prepareTaskMapRefreshRunBundle({
          ...fixture.input,
          sourceSliceProofs: [
            forgedSlice as unknown as typeof fixture.sourceSliceProofs[number],
            ...fixture.sourceSliceProofs.slice(1),
          ],
        }),
        /source.slice|digest|derived/i,
      );
      assert.throws(
        () => buildTaskMapRefreshRunSourceSliceProof({
          ownerScopeDigest: fixture.plan.ownerScopeDigest,
          bindingDigest:
            fixture.sourceSliceProofs[0].bindingDigest,
          sourceRevisions:
            fixture.sourceSliceProofs[0].sourceRevisions,
          acceptedSourceIdentityDigests: [digest(
            `forged-accepted-identity-${status}`,
          )],
        }),
        /accepted|identit|revision/i,
      );
    }
  });

  it("serializes genesis and new-binding partial or failed attempts as empty non-serving proofs", () => {
    for (const baselineKind of [
      "genesis",
      "accepted_new_binding",
    ] as const) {
      for (const status of ["partial", "failed"] as const) {
        const fixture = terminalWithoutPriorArtifactFixture(
          status,
          baselineKind,
        );
        const artifact = JSON.parse(
          fixture.prepared.members["checkpoints.json"]!,
        ) as {
          checkpoints: Array<{
            checkpoint: {
              state: string;
              watermark?: unknown;
              lastSuccessfulPollAt?: string;
              acceptedSourceIdentityDigests: string[];
            };
          }>;
          sourceSlices: Array<{
            sliceRole: string;
            sourceRevisions: unknown[];
            acceptedSourceIdentityDigests: string[];
          }>;
          laneReferences: Array<{ referenceKind: string }>;
        };
        assert.strictEqual(fixture.batch.publication.eligible, false);
        assert.strictEqual(fixture.batch.publication.state, "blocked");
        assert.ok(artifact.laneReferences.every(
          (reference) => reference.referenceKind === "attempt_output",
        ));
        assert.ok(artifact.checkpoints.every((record) => (
          record.checkpoint.state === status
          && record.checkpoint.watermark === undefined
          && record.checkpoint.lastSuccessfulPollAt === undefined
          && record.checkpoint.acceptedSourceIdentityDigests.length === 0
        )));
        assert.ok(artifact.sourceSlices.every((proof) => (
          proof.sliceRole === "observed_non_serving"
          && proof.sourceRevisions.length === 0
          && proof.acceptedSourceIdentityDigests.length === 0
        )));
      }
    }
  });

  it("serializes a successful empty provider output as an empty serving proof", () => {
    const fixture = successfulEmptyProviderFixture();
    const artifact = JSON.parse(
      fixture.prepared.members["checkpoints.json"]!,
    ) as {
      checkpoints: Array<{
        checkpoint: {
          state: string;
          acceptedSourceIdentityDigests: string[];
        };
      }>;
      sourceSlices: Array<{
        sliceRole: string;
        sourceRevisions: unknown[];
        acceptedSourceIdentityDigests: string[];
      }>;
      laneReferences: Array<{ referenceKind: string }>;
    };
    assert.strictEqual(artifact.checkpoints.length, 1);
    assert.strictEqual(artifact.checkpoints[0].checkpoint.state, "success");
    assert.deepStrictEqual(
      artifact.checkpoints[0].checkpoint
        .acceptedSourceIdentityDigests,
      [],
    );
    assert.deepStrictEqual(artifact.sourceSlices, [{
      ...fixture.sourceSlice,
    }]);
    assert.strictEqual(artifact.sourceSlices[0].sliceRole, "serving");
    assert.deepStrictEqual(artifact.sourceSlices[0].sourceRevisions, []);
    assert.deepStrictEqual(
      artifact.sourceSlices[0].acceptedSourceIdentityDigests,
      [],
    );
    assert.deepStrictEqual(
      artifact.laneReferences.map((reference) => reference.referenceKind),
      ["attempt_output"],
    );
  });

  it("serializes an exact no-op without inventing attempts or publication", () => {
    const fixture = exactNoOpFixture();
    assert.strictEqual(fixture.plan.isExactNoOp, true);
    assert.strictEqual(
      fixture.plan.candidateAcceptedStateDigest,
      fixture.plan.baseline.priorAcceptedStateDigest,
    );
    assert.strictEqual(fixture.batch.publication.state, "no_op");
    assert.strictEqual(fixture.batch.publication.eligible, false);
    assert.deepStrictEqual(fixture.batch.selectedLaneIds, []);
    const artifact = JSON.parse(
      fixture.prepared.members["checkpoints.json"]!,
    );
    assert.deepStrictEqual(artifact.checkpoints, []);
    assert.deepStrictEqual(artifact.sourceSlices, []);
    assert.deepStrictEqual(artifact.laneReferences, []);
  });

  it("rejects relabeling a baseline checkpoint as a new successful attempt", () => {
    const fixture = terminalAttemptFixture("succeeded");
    const firstAttempt = fixture.attemptCheckpoints[0];
    const bindingDigest = taskMapContractDigest(firstAttempt.binding);
    const prior = fixture.checkpoints.find((checkpoint) => (
      taskMapContractDigest(checkpoint.binding) === bindingDigest
    ))!;
    const forgedAttemptOutputs = fixture.attemptOutputs.map(
      (output, index) => index === 0
        ? {
            ...output,
            checkpointDigest: taskMapContractDigest(prior),
          }
        : output,
    );
    assert.throws(
      () => prepareTaskMapRefreshRunBundle({
        ...fixture.input,
        connectorCheckpoints: [
          prior,
          ...fixture.attemptCheckpoints.slice(1),
        ],
        attemptOutputs: forgedAttemptOutputs,
      }),
      /attempt-output checkpoint must be new|baseline/i,
    );
  });

  it("rejects self-valid failed attempts that drop or roll back retained checkpoint state", () => {
    for (const mutation of ["drop", "rollback"] as const) {
      const fixture = terminalAttemptFixture("failed");
      const original = fixture.attemptCheckpoints[0];
      const forged = cloneRecord(original);
      if (mutation === "drop") {
        delete forged.lastSuccessfulPollAt;
        delete forged.watermark;
        forged.watermarkHistoryDigests = [];
      } else {
        forged.watermark = {
          kind: original.watermark!.kind,
          valueDigest: digest("rolled-back-watermark"),
          observedThrough: original.watermark!.observedThrough,
        };
        forged.watermarkHistoryDigests = [
          forged.watermark.valueDigest,
        ];
      }
      forged.checkpointId = recomputeCheckpointId(forged);
      assert.deepStrictEqual(
        assertTaskMapConnectorCheckpoint(forged),
        forged,
      );
      const originalDigest = taskMapContractDigest(original);
      const forgedDigest = taskMapContractDigest(forged);
      assert.throws(
        () => prepareTaskMapRefreshRunBundle({
          ...fixture.input,
          connectorCheckpoints: fixture.connectorCheckpoints.map(
            (checkpoint) => (
              taskMapContractDigest(checkpoint) === originalDigest
                ? forged
                : checkpoint
            ),
          ),
          attemptOutputs: fixture.attemptOutputs.map((output) => (
            output.checkpointDigest === originalDigest
              ? { ...output, checkpointDigest: forgedDigest }
              : output
          )),
        }),
        /rolls back retained checkpoint state/i,
      );
    }
  });

  it("keeps a self-valid non-monotonic success audit-only for P10.1C transition validation", () => {
    const fixture = terminalAttemptFixture("succeeded");
    const original = fixture.attemptCheckpoints[0];
    const bindingDigest = taskMapContractDigest(original.binding);
    const prior = fixture.checkpoints.find((checkpoint) => (
      taskMapContractDigest(checkpoint.binding) === bindingDigest
    ))!;
    const auditOnly = cloneRecord(original);
    auditOnly.lastAttemptAt = "2026-07-28T02:00:00.000Z";
    auditOnly.lastSuccessfulPollAt = "2026-07-28T02:00:00.000Z";
    auditOnly.watermark!.observedThrough =
      "2026-07-28T02:00:00.000Z";
    auditOnly.checkpointId = recomputeCheckpointId(auditOnly);
    assert.ok(auditOnly.lastAttemptAt < prior.lastAttemptAt);
    assert.deepStrictEqual(
      assertTaskMapConnectorCheckpoint(auditOnly),
      auditOnly,
    );
    const originalDigest = taskMapContractDigest(original);
    const auditOnlyDigest = taskMapContractDigest(auditOnly);
    const prepared = prepareTaskMapRefreshRunBundle({
      ...fixture.input,
      connectorCheckpoints: fixture.connectorCheckpoints.map(
        (checkpoint) => (
          taskMapContractDigest(checkpoint) === originalDigest
            ? auditOnly
            : checkpoint
        ),
      ),
      attemptOutputs: fixture.attemptOutputs.map((output) => (
        output.checkpointDigest === originalDigest
          ? { ...output, checkpointDigest: auditOnlyDigest }
          : output
      )),
    });
    assert.match(prepared.bundleId, /^tmrefreshrun_[a-f0-9]{64}$/);
    // P10.1B intentionally proves only self-consistency. P10.1C must resolve
    // `prior` from accepted history and reject this lifecycle transition
    // before any CAS/current-ref promotion.
  });

  it("bounds huge keys, accessors, and proxies without reading untrusted properties", () => {
    const huge = Object.fromEntries(
      Array.from(
        {
          length:
            TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxObjectKeys + 1,
        },
        (_, index) => [`key-${index}`, index],
      ),
    );
    assert.throws(
      () => prepareTaskMapRefreshRunBundle(
        huge as unknown as Parameters<
          typeof prepareTaskMapRefreshRunBundle
        >[0],
      ),
      /object-key bound/i,
    );

    let accessorReads = 0;
    const accessorInput = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(accessorInput, "plan", {
      enumerable: true,
      get: () => {
        accessorReads += 1;
        return syntheticFixture().plan;
      },
    });
    assert.throws(
      () => prepareTaskMapRefreshRunBundle(
        accessorInput as unknown as Parameters<
          typeof prepareTaskMapRefreshRunBundle
        >[0],
      ),
      /accessor|hidden/i,
    );
    assert.strictEqual(accessorReads, 0);

    let proxyReads = 0;
    const proxy = new Proxy(syntheticFixture().input, {
      get(target, property, receiver) {
        proxyReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    assert.throws(
      () => prepareTaskMapRefreshRunBundle(proxy),
      /snapshot|plain JSON|clone/i,
    );
    assert.strictEqual(proxyReads, 0);
  });

  it("persists only a digest proof for the optional source snapshot", () => {
    const fixture = syntheticFixture();
    const proofBytes = fixture.prepared.members["source-snapshot.json"];
    assert.ok(proofBytes);
    const proof = JSON.parse(proofBytes);
    assert.strictEqual(proof.ownerScopeDigest, fixture.plan.ownerScopeDigest);
    assert.strictEqual(proof.snapshotId, fixture.snapshot.snapshotId);
    assert.strictEqual(proof.sourceBindingCount, 2);
    assert.strictEqual(proof.sourceRevisionCount, 2);
    assert.strictEqual(
      proof.privacy.rawSourceObjectIdentifiersStored,
      false,
    );
    for (const envelope of fixture.snapshot.envelopes) {
      assert.ok(!proofBytes.includes(envelope.sourceObjectId));
      assert.ok(!proofBytes.includes(envelope.sourceRevision));
      assert.ok(!proofBytes.includes(envelope.binding.connectionId));
    }
    assert.ok(!proofBytes.includes("\"envelopes\""));
    assert.ok(!proofBytes.includes("\"discoveryPointers\""));
  });

  it("keeps raw/body/source/revision sentinels out of every member and rejects known credential forms", () => {
    const snapshot = sourceSnapshot("BODY_PRIVATE_SENTINEL");
    const fixture = syntheticFixture(true, snapshot);
    const persistedByFile = {
      ...fixture.prepared.members,
      "manifest.json": taskMapContractCanonicalJson(
        fixture.prepared.manifest,
      ),
      COMMITTED: taskMapContractCanonicalJson(
        fixture.prepared.commitMarker,
      ),
    };
    const absentSentinels = [
      "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      "/synthetic/private/path",
      "private-person@example.test",
      "PRIVATE_BODY_TEXT_SENTINEL",
      ...snapshot.envelopes.flatMap((envelope) => [
        envelope.sourceObjectId,
        envelope.sourceRevision,
      ]),
    ];
    for (const [fileName, bytes] of Object.entries(persistedByFile)) {
      for (const sentinel of absentSentinels) {
        assert.ok(
          !bytes.includes(sentinel),
          `${fileName} retained a forbidden sentinel`,
        );
      }
    }

    const secretCheckpoint = advanceTaskMapConnectorCheckpoint(null, {
      binding: {
        ...BINDINGS[0],
        connectionId: "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      },
      sourceKind: BINDINGS[0].sourceKind,
      adapterVersion: "strategy-adapter.1",
      capabilities: ["read_context"],
      state: "success",
      attemptedAt: "2026-07-28T23:00:00.000Z",
      proposedWatermark: {
        kind: "revision",
        valueDigest: digest("secret-checkpoint-watermark"),
        observedThrough: "2026-07-28T23:00:00.000Z",
      },
      acceptedSourceIdentityDigests: [],
    });
    assert.doesNotThrow(
      () => assertTaskMapConnectorCheckpoint(secretCheckpoint),
    );
    assert.throws(
      () => prepareTaskMapRefreshRunBundle({
        ...fixture.input,
        connectorCheckpoints: [secretCheckpoint],
      }),
      /known sensitive string form/i,
    );
  });

  it("rejects forged cross-file plan, batch, checkpoints, and snapshots", () => {
    const fixture = syntheticFixture();
    const forgedPlan = cloneRecord(fixture.plan) as unknown as JsonRecord;
    forgedPlan.candidateAcceptedStateDigest = digest("forged-candidate");
    assert.throws(
      () => prepareTaskMapRefreshRunBundle({
        ...fixture.input,
        plan: forgedPlan as unknown as typeof fixture.plan,
      }),
      /plan|candidate|digest|canonical/i,
    );

    const alternateDraft = planDraft(fixture.snapshot, fixture.checkpoints);
    alternateDraft.deterministicReplayDigest = digest("alternate-replay");
    const alternatePlan = buildTaskMapRefreshPlan(alternateDraft);
    const alternateBatch = selectTaskMapReadyBatch(alternatePlan, {
      maxConcurrency: 2,
      laneStates: alternatePlan.lanes.map((plannedLane) => ({
        laneId: plannedLane.laneId,
        status: "pending",
      })),
    });
    assert.throws(
      () => prepareTaskMapRefreshRunBundle({
        ...fixture.input,
        batch: alternateBatch,
      }),
      /batch|plan|canonical/i,
    );

    const forgedCheckpoint = cloneRecord(
      fixture.checkpoints[0],
    ) as unknown as JsonRecord;
    forgedCheckpoint.acceptedSourceIdentityDigests = [digest("forged-source")];
    assert.throws(
      () => prepareTaskMapRefreshRunBundle({
        ...fixture.input,
        connectorCheckpoints: [
          forgedCheckpoint as unknown as TaskMapConnectorCheckpointV1,
          fixture.checkpoints[1],
        ],
      }),
      /checkpoint|digest|canonical/i,
    );
    assert.throws(
      () => prepareTaskMapRefreshRunBundle({
        ...fixture.input,
        connectorCheckpoints: [fixture.checkpoints[0]],
      }),
      /checkpoint|resolve|referenc/i,
    );
    assert.throws(
      () => prepareTaskMapRefreshRunBundle({
        ...fixture.input,
        connectorCheckpoints: [
          ...fixture.checkpoints,
          advanceTaskMapConnectorCheckpoint(null, {
            binding: {
              ...BINDINGS[0],
              connectionId: "synthetic-unreferenced-connection",
            },
            sourceKind: BINDINGS[0].sourceKind,
            adapterVersion: "strategy-adapter.1",
            capabilities: ["read_context"],
            state: "success",
            attemptedAt: "2026-07-28T09:00:00.000Z",
            proposedWatermark: {
              kind: "revision",
              valueDigest: digest("unreferenced-watermark"),
              observedThrough: "2026-07-28T09:00:00.000Z",
            },
            acceptedSourceIdentityDigests: [digest("unreferenced-source")],
          }),
        ],
      }),
      /checkpoint|resolve|referenc/i,
    );

    const forgedSnapshot = cloneRecord(
      fixture.snapshot,
    ) as unknown as JsonRecord;
    forgedSnapshot.ownerScopeDigest = digest("different-owner");
    assert.throws(
      () => prepareTaskMapRefreshRunBundle({
        ...fixture.input,
        sourceSnapshot:
          forgedSnapshot as unknown as TaskMapSourceSnapshotV1,
      }),
      /snapshot|owner|digest|canonical/i,
    );
  });

  it("enforces exact 4 MiB member and 16 MiB aggregate byte bounds", () => {
    const maxMember = TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxMemberBytes;
    const maxTotal = TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxTotalBytes;
    assert.strictEqual(maxMember, 4 * 1024 * 1024);
    assert.strictEqual(maxTotal, 16 * 1024 * 1024);
    assert.doesNotThrow(
      () => assertTaskMapRefreshRunBundleByteLimits([maxMember]),
    );
    assert.doesNotThrow(
      () => assertTaskMapRefreshRunBundleByteLimits([
        maxMember,
        maxMember,
        maxMember,
        maxMember,
      ]),
    );
    assert.throws(
      () => assertTaskMapRefreshRunBundleByteLimits([maxMember + 1]),
      /member|byte|bound/i,
    );
    assert.throws(
      () => assertTaskMapRefreshRunBundleByteLimits([
        maxMember,
        maxMember,
        maxMember,
        maxMember,
        1,
      ]),
      /aggregate|total|bound/i,
    );
  });
});

describe("P10.1B immutable filesystem materialization", () => {
  it("verifies the fixed-byte golden v1 bundle without current builders", async () => {
    const fixturePath = path.resolve(
      "tests/fixtures/taskmap-p10.1b/golden-v1.json",
    );
    const golden = JSON.parse(await readFile(fixturePath, "utf8")) as {
      fixtureVersion: string;
      expectedContractVersion: string;
      expectedBundleId: string;
      expectedManifestByteSha256: string;
      files: Record<string, string>;
    };
    assert.strictEqual(
      golden.fixtureVersion,
      "taskmap-refresh-run-golden-fixture.v1",
    );
    assert.strictEqual(
      golden.expectedContractVersion,
      "taskmap-refresh-run-bundle.v1",
    );
    assert.deepStrictEqual(
      Object.keys(golden.files).sort(),
      [...CLOSED_FILES].sort(),
    );
    const exactBytes = Object.fromEntries(
      Object.entries(golden.files).map(([fileName, base64]) => {
        const bytes = Buffer.from(base64, "base64").toString("utf8");
        assert.strictEqual(
          Buffer.from(bytes, "utf8").toString("base64"),
          base64,
          `${fileName} has non-canonical fixture encoding`,
        );
        assert.ok(
          !bytes.endsWith("\n"),
          `${fileName} gained a trailing newline`,
        );
        return [fileName, bytes];
      }),
    );
    const manifest = JSON.parse(exactBytes["manifest.json"]);
    const marker = JSON.parse(exactBytes.COMMITTED);
    assert.strictEqual(
      manifest.contractVersion,
      golden.expectedContractVersion,
    );
    assert.strictEqual(manifest.bundleId, golden.expectedBundleId);
    assert.strictEqual(marker.bundleId, golden.expectedBundleId);
    assert.strictEqual(
      marker.manifestByteSha256,
      golden.expectedManifestByteSha256,
    );
    assert.strictEqual(
      sha256Text(exactBytes["manifest.json"]),
      golden.expectedManifestByteSha256,
    );

    await withRunRoot(async (runRoot) => {
      const target = path.join(runRoot, golden.expectedBundleId);
      await mkdir(target, { mode: DIRECTORY_MODE });
      await chmod(target, DIRECTORY_MODE);
      for (const [fileName, bytes] of Object.entries(exactBytes)) {
        await writeFile(path.join(target, fileName), bytes, {
          mode: FILE_MODE,
        });
        await chmod(path.join(target, fileName), FILE_MODE);
      }
      const verified = await verifyTaskMapRefreshRunBundle(target);
      assert.strictEqual(verified.bundleId, golden.expectedBundleId);
      assert.strictEqual(
        verified.manifest.contractVersion,
        golden.expectedContractVersion,
      );
    });
    // If a semantic validator change makes these historical v1 bytes invalid,
    // bump the affected contract version; never silently replace this fixture.
    // 2026-08-04: fixture explicitly re-cut from exactNoOpFixture() after the
    // canonical key sort moved from localeCompare to Unicode scalar order to
    // match the Swift reader (the old locale-dependent bytes were themselves
    // the bug — no healthy v1 bundles existed outside this fixture). Semantic
    // content is unchanged; only key order and derived digests differ.
  });

  it("creates, verifies, permissions, canonical no-newline bytes, and retries", async () => {
    await withRunRoot(async (runRoot) => {
      const { fixture, bundleDirectory } = await materialized(runRoot);
      assert.strictEqual(mode(await stat(bundleDirectory)), DIRECTORY_MODE);
      assert.deepStrictEqual((await readdir(bundleDirectory)).sort(), [
        ...CLOSED_FILES,
      ]);
      for (const fileName of CLOSED_FILES) {
        const filePath = path.join(bundleDirectory, fileName);
        assert.strictEqual(mode(await stat(filePath)), FILE_MODE);
        const bytes = await readFile(filePath);
        assert.ok(bytes.length > 0);
        assert.notStrictEqual(bytes.at(-1), 0x0a);
        const parsed = JSON.parse(bytes.toString("utf8"));
        assert.strictEqual(
          bytes.toString("utf8"),
          taskMapContractCanonicalJson(parsed),
        );
      }
      const verified = await verifyTaskMapRefreshRunBundle(
        bundleDirectory,
        fixture.prepared.bundleId,
      );
      assert.strictEqual(verified.bundleId, fixture.prepared.bundleId);
      assert.deepStrictEqual(verified.plan, fixture.plan);
      assert.deepStrictEqual(verified.batch, fixture.batch);
      assert.ok(verified.sourceSnapshotProof);
      const retry = await materializeTaskMapRefreshRunBundle(
        runRoot,
        fixture.prepared,
      );
      assert.strictEqual(retry.status, "already_present");
      assert.strictEqual(retry.sameUidResidual, false);
    });
  });

  it("keeps COMMITTED last and never exposes a partial final directory", async () => {
    await withRunRoot(async (runRoot) => {
      const fixture = syntheticFixture();
      let releaseManifest!: () => void;
      let sawManifest!: () => void;
      const manifestReached = new Promise<void>((resolve) => {
        sawManifest = resolve;
      });
      const manifestRelease = new Promise<void>((resolve) => {
        releaseManifest = resolve;
      });
      const first = materializeTaskMapRefreshRunBundle(
        runRoot,
        fixture.prepared,
        {
          faultInjection: async (point) => {
            if (point === "after_manifest") {
              sawManifest();
              await manifestRelease;
            }
          },
        },
      );
      await manifestReached;
      const finalDirectory = path.join(runRoot, fixture.prepared.bundleId);
      let finalNames: string[] | undefined;
      try {
        finalNames = await readdir(finalDirectory);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        assert.ok(code === "ENOENT" || code === "ENOTDIR");
      }
      assert.ok(
        finalNames === undefined
        || finalNames.length === 0
        || taskMapContractCanonicalJson([...finalNames].sort())
          === taskMapContractCanonicalJson([...CLOSED_FILES]),
      );
      const rootNames = await readdir(runRoot);
      const staging = rootNames.filter((name) =>
        name.startsWith(".tmrefreshrun-stage-")
      );
      assert.ok(staging.length >= 1);
      for (const stageName of staging) {
        const stageFiles = await readdir(path.join(runRoot, stageName));
        assert.ok(!stageFiles.includes("COMMITTED"));
      }

      const second = materializeTaskMapRefreshRunBundle(
        runRoot,
        fixture.prepared,
      );
      releaseManifest();
      const results = await Promise.all([first, second]);
      assert.deepStrictEqual(
        results.map((result) => result.status).sort(),
        ["already_present", "created"],
      );
      assert.strictEqual(
        results.find((result) => result.status === "created")!
          .sameUidResidual,
        false,
      );
      assert.strictEqual(
        results.find((result) => result.status === "already_present")!
          .sameUidResidual,
        true,
      );
      assert.deepStrictEqual((await readdir(finalDirectory)).sort(), [
        ...CLOSED_FILES,
      ]);
    });
  });

  it("preserves a marker-last fault residual without publishing a partial run", async () => {
    await withRunRoot(async (runRoot) => {
      const fixture = syntheticFixture();
      const failure = expectBundleError(
        materializeTaskMapRefreshRunBundle(
          runRoot,
          fixture.prepared,
          {
            faultInjection: (point) => {
              if (point === "after_manifest") {
                throw new Error("synthetic fault after manifest");
              }
            },
          },
        ),
        ["write_failed"],
      );
      const error = await failure;
      assert.strictEqual(error.sameUidResidual, true);
      const names = await readdir(runRoot);
      const staging = names.filter((name) =>
        name.startsWith(".tmrefreshrun-stage-")
      );
      assert.ok(staging.length >= 1);
      assert.ok(!names.includes(fixture.prepared.bundleId));
      for (const stageName of staging) {
        const stageFiles = await readdir(path.join(runRoot, stageName));
        assert.ok(stageFiles.includes("manifest.json"));
        assert.ok(!stageFiles.includes("COMMITTED"));
      }
    });
  });

  it("preserves a synthetic partial member write only in staging", async () => {
    await withRunRoot(async (runRoot) => {
      const fixture = syntheticFixture();
      const partialBytes = fixture.prepared.members["plan.json"]!
        .slice(0, 97);
      const error = await expectBundleError(
        materializeTaskMapRefreshRunBundle(
          runRoot,
          fixture.prepared,
          {
            faultInjection: async (point) => {
              if (point !== "after_plan") return;
              const stageName = (await readdir(runRoot)).find((name) => (
                name.startsWith(".tmrefreshrun-stage-")
              ))!;
              const planPath = path.join(
                runRoot,
                stageName,
                "plan.json",
              );
              await writeFile(planPath, partialBytes, { mode: FILE_MODE });
              await chmod(planPath, FILE_MODE);
              throw new Error("synthetic partial member write");
            },
          },
        ),
        ["write_failed"],
      );
      assert.strictEqual(error.sameUidResidual, true);
      const names = await readdir(runRoot);
      assert.ok(!names.includes(fixture.prepared.bundleId));
      const stageName = names.find((name) =>
        name.startsWith(".tmrefreshrun-stage-")
      )!;
      assert.strictEqual(
        await readFile(
          path.join(runRoot, stageName, "plan.json"),
          "utf8",
        ),
        partialBytes,
      );
      assert.ok(
        !(await readdir(path.join(runRoot, stageName)))
          .includes("COMMITTED"),
      );
    });
  });

  it("reports immutable residuals for every post-stage fault point", async () => {
    const faultPoints = [
      "after_plan",
      "after_batch",
      "after_checkpoints",
      "after_source_snapshot",
      "after_manifest",
      "after_precommit_directory_sync",
      "after_committed",
      "after_final_directory_sync",
      "after_reservation",
      "after_publish_rename",
    ] as const;
    for (const faultPoint of faultPoints) {
      await withRunRoot(async (runRoot) => {
        const fixture = syntheticFixture();
        const error = await expectBundleError(
          materializeTaskMapRefreshRunBundle(
            runRoot,
            fixture.prepared,
            {
              faultInjection: (point) => {
                if (point === faultPoint) {
                  throw new Error(`synthetic fault at ${faultPoint}`);
                }
              },
            },
          ),
          ["write_failed"],
        );
        assert.strictEqual(error.sameUidResidual, true);
        const names = await readdir(runRoot);
        assert.ok(names.some((name) => (
          name.startsWith(".tmrefreshrun-stage-")
          || name === fixture.prepared.bundleId
        )));
      });
    }
  });

  it("hardens staging, reservation, and files under umask 0777", async () => {
    await withRunRoot(async (runRoot) => {
      const fixture = syntheticFixture();
      const moduleUrl = pathToFileURL(path.resolve(
        process.cwd(),
        "dist/src/engine/taskmap/refresh-run-bundle.js",
      )).href;
      const program = [
        "let input = '';",
        "for await (const chunk of process.stdin) input += chunk;",
        "const payload = JSON.parse(input);",
        "process.umask(0o777);",
        "const module = await import(process.argv[1]);",
        "const result = await module.materializeTaskMapRefreshRunBundle(",
        "  payload.runRoot, payload.prepared",
        ");",
        "process.stdout.write(JSON.stringify(result));",
      ].join("\n");
      const child = spawnSync(
        process.execPath,
        ["--input-type=module", "-e", program, moduleUrl],
        {
          encoding: "utf8",
          input: JSON.stringify({
            runRoot,
            prepared: fixture.prepared,
          }),
        },
      );
      assert.strictEqual(child.status, 0, child.stderr);
      const result = JSON.parse(child.stdout);
      assert.deepStrictEqual(result, {
        status: "created",
        bundleId: fixture.prepared.bundleId,
        sameUidResidual: false,
      });
      const bundleDirectory = path.join(
        runRoot,
        fixture.prepared.bundleId,
      );
      assert.strictEqual(mode(await stat(bundleDirectory)), DIRECTORY_MODE);
      for (const fileName of CLOSED_FILES) {
        assert.strictEqual(
          mode(await stat(path.join(bundleDirectory, fileName))),
          FILE_MODE,
        );
      }
    });
  });

  it("rejects tamper, extra members, and missing members", async () => {
    await withRunRoot(async (runRoot) => {
      const { bundleDirectory } = await materialized(runRoot);
      await writeFile(
        path.join(bundleDirectory, "plan.json"),
        `${await readFile(path.join(bundleDirectory, "plan.json"), "utf8")} `,
      );
      await expectBundleError(
        verifyTaskMapRefreshRunBundle(bundleDirectory),
        ["bundle_corrupt", "unsafe_target"],
      );
    });
    await withRunRoot(async (runRoot) => {
      const { bundleDirectory } = await materialized(runRoot);
      await writeFile(
        path.join(bundleDirectory, "unknown.json"),
        "{}",
        { mode: FILE_MODE },
      );
      await expectBundleError(
        verifyTaskMapRefreshRunBundle(bundleDirectory),
        ["bundle_corrupt", "invalid_contract"],
      );
    });
    await withRunRoot(async (runRoot) => {
      const { bundleDirectory } = await materialized(runRoot);
      await unlink(path.join(bundleDirectory, "batch.json"));
      await expectBundleError(
        verifyTaskMapRefreshRunBundle(bundleDirectory),
        ["bundle_corrupt", "invalid_contract"],
      );
    });
    await withRunRoot(async (runRoot) => {
      const { bundleDirectory } = await materialized(runRoot);
      const markerPath = path.join(bundleDirectory, "COMMITTED");
      const marker = JSON.parse(await readFile(markerPath, "utf8"));
      marker.manifestByteSha256 = digest("forged-manifest-byte-digest");
      await writeFile(
        markerPath,
        taskMapContractCanonicalJson(marker),
      );
      await expectBundleError(
        verifyTaskMapRefreshRunBundle(bundleDirectory),
        ["bundle_corrupt", "invalid_contract"],
      );
    });
  });

  it("rejects nested checkpoint and source-slice artifact forgery", async () => {
    const mutations: Array<(artifact: {
      checkpoints: Array<{
        checkpointDigest: string;
        checkpoint: { checkpointId: string };
      }>;
      sourceSlices: Array<{
        sourceSliceDigest: string;
        acceptedSourceIdentityDigests: string[];
      }>;
    }) => void> = [
      (artifact) => {
        artifact.checkpoints[0].checkpoint.checkpointId =
          `tmcheckpoint_${digest("nested-id").slice(0, 16)}`;
      },
      (artifact) => {
        artifact.checkpoints[0].checkpointDigest =
          digest("nested-checkpoint-digest");
      },
      (artifact) => {
        artifact.sourceSlices[0].sourceSliceDigest =
          digest("nested-source-slice-digest");
      },
      (artifact) => {
        artifact.sourceSlices[0].acceptedSourceIdentityDigests = [
          digest("nested-accepted-identity"),
        ];
      },
    ];
    for (const mutate of mutations) {
      await withRunRoot(async (runRoot) => {
        const fixture = terminalAttemptFixture("failed");
        await materializeTaskMapRefreshRunBundle(
          runRoot,
          fixture.prepared,
        );
        const bundleDirectory = path.join(
          runRoot,
          fixture.prepared.bundleId,
        );
        const checkpointsPath = path.join(
          bundleDirectory,
          "checkpoints.json",
        );
        const artifact = JSON.parse(
          await readFile(checkpointsPath, "utf8"),
        );
        mutate(artifact);
        await writeFile(
          checkpointsPath,
          taskMapContractCanonicalJson(artifact),
        );
        await assert.rejects(
          () => verifyTaskMapRefreshRunBundle(bundleDirectory),
          /checkpoint|source.slice|digest|identit|derived|invalid/i,
        );
      });
    }
  });

  it("rejects forged source-snapshot IDs and privacy claims", async () => {
    for (const mutation of ["snapshot_id", "privacy"] as const) {
      await withRunRoot(async (runRoot) => {
        if (mutation === "snapshot_id") {
          const fixture = syntheticFixture();
          const forged = resealSourceSnapshotProof(
            fixture.prepared,
            (proof) => {
              proof.snapshotId = "tmsnapshot_0000000000000000";
            },
          );
          const target = await writePreparedBundleUnchecked(
            runRoot,
            forged,
          );
          await assert.rejects(
            () => verifyTaskMapRefreshRunBundle(target),
            /source-snapshot ID is not derived/i,
          );
          return;
        }
        const { bundleDirectory } = await materialized(runRoot);
        const proofPath = path.join(
          bundleDirectory,
          "source-snapshot.json",
        );
        const proof = JSON.parse(await readFile(proofPath, "utf8"));
        proof.privacy.sourceBodiesStored = true;
        await writeFile(
          proofPath,
          taskMapContractCanonicalJson(proof),
        );
        await assert.rejects(
          () => verifyTaskMapRefreshRunBundle(bundleDirectory),
          /source-snapshot|snapshot ID|privacy|private source/i,
        );
      });
    }
  });

  it("rejects recomputed duplicate attempt roles for one provider lane", async () => {
    const fixture = terminalAttemptFixture("succeeded");
    const reference = JSON.parse(
      fixture.prepared.members["checkpoints.json"]!,
    ).laneReferences.find(
      (candidate: { referenceKind: string }) => (
        candidate.referenceKind === "attempt_output"
      ),
    ) as {
      laneId: string;
      referenceKind: "attempt_output";
      checkpointDigest: string;
      sourceSliceDigest: string;
    };
    const original = fixture.attemptCheckpoints.find((checkpoint) => (
      taskMapContractDigest(checkpoint) === reference.checkpointDigest
    ))!;
    const duplicate = cloneRecord(original);
    duplicate.lastAttemptAt = "2026-07-28T21:00:00.000Z";
    duplicate.lastSuccessfulPollAt = "2026-07-28T21:00:00.000Z";
    duplicate.watermark!.observedThrough =
      "2026-07-28T21:00:00.000Z";
    duplicate.checkpointId = recomputeCheckpointId(duplicate);
    const duplicateDigest = taskMapContractDigest(duplicate);
    const forged = resealCheckpointArtifact(
      fixture.prepared,
      (artifact) => {
        artifact.checkpoints.push({
          checkpointDigest: duplicateDigest,
          bindingDigest: taskMapContractDigest(duplicate.binding),
          checkpoint: duplicate,
        });
        artifact.laneReferences.push({
          ...reference,
          checkpointDigest: duplicateDigest,
        });
      },
    );
    await withRunRoot(async (runRoot) => {
      await expectBundleError(
        materializeTaskMapRefreshRunBundle(runRoot, forged),
        ["invalid_contract"],
      );
    });
  });

  it("rejects a resealed checkpoint that contradicts lane error audit facts", async () => {
    const fixture = terminalAttemptFixture("failed");
    const checkpointArtifact = JSON.parse(
      fixture.prepared.members["checkpoints.json"]!,
    ) as TaskMapRefreshRunCheckpointsV1;
    const attemptReference = checkpointArtifact.laneReferences.find(
      (reference) => reference.referenceKind === "attempt_output",
    )!;
    const originalRecord = checkpointArtifact.checkpoints.find(
      (record) => (
        record.checkpointDigest === attemptReference.checkpointDigest
      ),
    )!;
    const contradictory = cloneRecord(originalRecord.checkpoint);
    contradictory.error!.code = "synthetic_contradictory_failure";
    contradictory.error!.detailDigest =
      digest("synthetic-contradictory-failure");
    contradictory.checkpointId = recomputeCheckpointId(contradictory);
    assert.deepStrictEqual(
      assertTaskMapConnectorCheckpoint(contradictory),
      contradictory,
    );
    const contradictoryDigest = taskMapContractDigest(contradictory);
    const forged = resealCheckpointArtifact(
      fixture.prepared,
      (artifact) => {
        const record = artifact.checkpoints.find((candidate) => (
          candidate.checkpointDigest === originalRecord.checkpointDigest
        ))!;
        record.checkpoint = contradictory;
        record.checkpointDigest = contradictoryDigest;
        for (const reference of artifact.laneReferences) {
          if (
            reference.checkpointDigest
              === originalRecord.checkpointDigest
          ) {
            reference.checkpointDigest = contradictoryDigest;
          }
        }
      },
    );
    await withRunRoot(async (runRoot) => {
      await expectBundleError(
        materializeTaskMapRefreshRunBundle(runRoot, forged),
        ["invalid_contract"],
      );
    });
  });

  it("rejects a fully resealed on-disk checkpoint secret", async () => {
    const fixture = terminalAttemptFixture("failed");
    const checkpointArtifact = JSON.parse(
      fixture.prepared.members["checkpoints.json"]!,
    ) as TaskMapRefreshRunCheckpointsV1;
    const attemptReference = checkpointArtifact.laneReferences.find(
      (reference) => reference.referenceKind === "attempt_output",
    )!;
    const originalRecord = checkpointArtifact.checkpoints.find(
      (record) => (
        record.checkpointDigest === attemptReference.checkpointDigest
      ),
    )!;
    const secretCheckpoint = cloneRecord(originalRecord.checkpoint);
    secretCheckpoint.error!.code =
      "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    secretCheckpoint.checkpointId =
      recomputeCheckpointId(secretCheckpoint);
    const secretDigest = taskMapContractDigest(secretCheckpoint);
    const forged = resealCheckpointArtifact(
      fixture.prepared,
      (artifact) => {
        const record = artifact.checkpoints.find((candidate) => (
          candidate.checkpointDigest === originalRecord.checkpointDigest
        ))!;
        record.checkpoint = secretCheckpoint;
        record.checkpointDigest = secretDigest;
        for (const reference of artifact.laneReferences) {
          if (
            reference.checkpointDigest
              === originalRecord.checkpointDigest
          ) {
            reference.checkpointDigest = secretDigest;
          }
        }
      },
    );
    await withRunRoot(async (runRoot) => {
      const target = path.join(runRoot, forged.bundleId);
      await mkdir(target, { mode: DIRECTORY_MODE });
      await chmod(target, DIRECTORY_MODE);
      for (const [fileName, bytes] of Object.entries(forged.members)) {
        await writeFile(path.join(target, fileName), bytes, {
          mode: FILE_MODE,
        });
        await chmod(path.join(target, fileName), FILE_MODE);
      }
      for (const [fileName, bytes] of [
        [
          "manifest.json",
          taskMapContractCanonicalJson(forged.manifest),
        ],
        [
          "COMMITTED",
          taskMapContractCanonicalJson(forged.commitMarker),
        ],
      ] as const) {
        await writeFile(path.join(target, fileName), bytes, {
          mode: FILE_MODE,
        });
        await chmod(path.join(target, fileName), FILE_MODE);
      }
      await assert.rejects(
        () => verifyTaskMapRefreshRunBundle(target),
        /known sensitive string form/i,
      );
    });
  });

  it("fails closed on every pre-existing target kind without clobbering", async () => {
    await withRunRoot(async (runRoot) => {
      const fixture = syntheticFixture();
      const target = path.join(runRoot, fixture.prepared.bundleId);
      await mkdir(target, { mode: DIRECTORY_MODE });
      const error = await expectBundleError(
        materializeTaskMapRefreshRunBundle(
          runRoot,
          fixture.prepared,
          { reservationWaitMs: 0 },
        ),
        ["reservation_incomplete", "unsafe_target"],
      );
      assert.deepStrictEqual(await readdir(target), []);
      assert.ok(
        error.code !== "reservation_incomplete" || error.sameUidResidual,
      );
    });
    await withRunRoot(async (runRoot) => {
      const fixture = syntheticFixture();
      const outside = await mkdtemp(
        path.join(await realpath(tmpdir()), "taskmap-refresh-run-outside-"),
      );
      await chmod(outside, DIRECTORY_MODE);
      try {
        const target = path.join(runRoot, fixture.prepared.bundleId);
        await symlink(outside, target);
        await expectBundleError(
          materializeTaskMapRefreshRunBundle(
            runRoot,
            fixture.prepared,
            { reservationWaitMs: 0 },
          ),
          ["unsafe_target"],
        );
        assert.deepStrictEqual(await readdir(outside), []);
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });
    await withRunRoot(async (runRoot) => {
      const fixture = syntheticFixture();
      const target = path.join(runRoot, fixture.prepared.bundleId);
      await writeFile(target, "regular-target-sentinel", {
        mode: FILE_MODE,
      });
      await chmod(target, FILE_MODE);
      await expectBundleError(
        materializeTaskMapRefreshRunBundle(
          runRoot,
          fixture.prepared,
          { reservationWaitMs: 0 },
        ),
        ["unsafe_target"],
      );
      assert.strictEqual(
        await readFile(target, "utf8"),
        "regular-target-sentinel",
      );
    });
    await withRunRoot(async (runRoot) => {
      const fixture = syntheticFixture();
      const target = path.join(runRoot, fixture.prepared.bundleId);
      await mkdir(target, { mode: DIRECTORY_MODE });
      await chmod(target, DIRECTORY_MODE);
      const sentinel = path.join(target, "nonempty-target-sentinel");
      await writeFile(sentinel, "preserve-me", { mode: FILE_MODE });
      await chmod(sentinel, FILE_MODE);
      await expectBundleError(
        materializeTaskMapRefreshRunBundle(
          runRoot,
          fixture.prepared,
          { reservationWaitMs: 0 },
        ),
        ["unsafe_target"],
      );
      assert.deepStrictEqual(
        await readdir(target),
        ["nonempty-target-sentinel"],
      );
      assert.strictEqual(await readFile(sentinel, "utf8"), "preserve-me");
    });
  });

  it("rejects member symlinks, hardlinks, FIFOs, and Unix sockets", async () => {
    await withRunRoot(async (runRoot) => {
      const { bundleDirectory } = await materialized(runRoot);
      const planPath = path.join(bundleDirectory, "plan.json");
      const outside = path.join(runRoot, "outside.json");
      await writeFile(outside, "{}", { mode: FILE_MODE });
      await unlink(planPath);
      await symlink(outside, planPath);
      await expectBundleError(
        verifyTaskMapRefreshRunBundle(bundleDirectory),
        ["unsafe_target"],
      );
    });
    await withRunRoot(async (runRoot) => {
      const { bundleDirectory } = await materialized(runRoot);
      const planPath = path.join(bundleDirectory, "plan.json");
      const batchPath = path.join(bundleDirectory, "batch.json");
      await unlink(batchPath);
      await link(planPath, batchPath);
      assert.ok((await lstat(planPath)).nlink > 1);
      await expectBundleError(
        verifyTaskMapRefreshRunBundle(bundleDirectory),
        ["unsafe_target"],
      );
    });
    await withRunRoot(async (runRoot) => {
      const { bundleDirectory } = await materialized(runRoot);
      const planPath = path.join(bundleDirectory, "plan.json");
      await unlink(planPath);
      const made = spawnSync("mkfifo", [planPath], { encoding: "utf8" });
      assert.strictEqual(made.status, 0, made.stderr);
      await expectBundleError(
        verifyTaskMapRefreshRunBundle(bundleDirectory),
        ["unsafe_target"],
      );
    });
    await withRunRoot(async (runRoot) => {
      const { bundleDirectory } = await materialized(runRoot);
      const planPath = path.join(bundleDirectory, "plan.json");
      await unlink(planPath);
      const socketPath = path.join(runRoot, "bundle.sock");
      const server = createServer();
      try {
        await new Promise<void>((resolve, reject) => {
          server.once("error", reject);
          server.listen(socketPath, resolve);
        });
        await rename(socketPath, planPath);
        assert.ok((await lstat(planPath)).isSocket());
        await expectBundleError(
          verifyTaskMapRefreshRunBundle(bundleDirectory),
          ["unsafe_target"],
        );
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });

  it("rejects file, directory, and run-root permission drift", async () => {
    await withRunRoot(async (runRoot) => {
      const { bundleDirectory } = await materialized(runRoot);
      await chmod(path.join(bundleDirectory, "plan.json"), 0o640);
      await expectBundleError(
        verifyTaskMapRefreshRunBundle(bundleDirectory),
        ["unsafe_target"],
      );
    });
    await withRunRoot(async (runRoot) => {
      const { bundleDirectory } = await materialized(runRoot);
      await chmod(bundleDirectory, 0o750);
      await expectBundleError(
        verifyTaskMapRefreshRunBundle(bundleDirectory),
        ["unsafe_target"],
      );
    });
    await withRunRoot(async (runRoot) => {
      const fixture = syntheticFixture();
      await chmod(runRoot, 0o750);
      await expectBundleError(
        materializeTaskMapRefreshRunBundle(runRoot, fixture.prepared),
        ["invalid_root"],
      );
    });
    await withRunRoot(async (runRoot) => {
      const { bundleDirectory } = await materialized(runRoot);
      const planPath = path.join(bundleDirectory, "plan.json");
      await chmod(planPath, 0o4600);
      if (((await lstat(planPath)).mode & 0o7000) !== 0) {
        await expectBundleError(
          verifyTaskMapRefreshRunBundle(bundleDirectory),
          ["unsafe_target"],
        );
      }
    });
    await withRunRoot(async (runRoot) => {
      const { bundleDirectory } = await materialized(runRoot);
      await chmod(bundleDirectory, 0o1700);
      if (((await lstat(bundleDirectory)).mode & 0o7000) !== 0) {
        await expectBundleError(
          verifyTaskMapRefreshRunBundle(bundleDirectory),
          ["unsafe_target"],
        );
      }
    });
  });

  it("rejects invalid UTF-8 before canonical or digest re-encoding", async () => {
    await withRunRoot(async (runRoot) => {
      const { bundleDirectory } = await materialized(runRoot);
      const planPath = path.join(bundleDirectory, "plan.json");
      const bytes = await readFile(planPath);
      bytes[0] = 0xff;
      await writeFile(planPath, bytes);
      await chmod(planPath, FILE_MODE);
      await expectBundleError(
        verifyTaskMapRefreshRunBundle(bundleDirectory),
        ["bundle_corrupt"],
      );
    });
  });

  it("rejects canonical disk JSON beyond the nesting bound before re-canonicalization", async () => {
    await withRunRoot(async (runRoot) => {
      const { bundleDirectory } = await materialized(runRoot);
      const planPath = path.join(bundleDirectory, "plan.json");
      let nested: Record<string, unknown> = {};
      for (
        let depth = 0;
        depth
          <= TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxJsonDepth + 1;
        depth += 1
      ) {
        nested = { nested };
      }
      await writeFile(
        planPath,
        taskMapContractCanonicalJson(nested),
      );
      await expectBundleError(
        verifyTaskMapRefreshRunBundle(bundleDirectory),
        ["invalid_contract"],
      );
    });
  });

  it("rejects traversal aliases and a prepared-object collision", async () => {
    await withRunRoot(async (runRoot) => {
      const fixture = syntheticFixture();
      const aliasRoot = `${runRoot}-alias`;
      await symlink(runRoot, aliasRoot);
      try {
        await expectBundleError(
          materializeTaskMapRefreshRunBundle(
            aliasRoot,
            fixture.prepared,
          ),
          ["invalid_root", "unsafe_target"],
        );
      } finally {
        await unlink(aliasRoot);
      }
    });
    await withRunRoot(async (runRoot) => {
      const fixture = syntheticFixture();
      const forged = cloneRecord(
        fixture.prepared,
      ) as unknown as PreparedTaskMapRefreshRunBundle;
      (forged as unknown as JsonRecord).bundleId =
        `tmrefreshrun_${digest("prepared-collision")}`;
      await expectBundleError(
        materializeTaskMapRefreshRunBundle(runRoot, forged),
        ["invalid_contract"],
      );
    });
  });
});
