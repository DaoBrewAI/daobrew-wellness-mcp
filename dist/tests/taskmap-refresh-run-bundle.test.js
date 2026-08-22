"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = __importDefault(require("node:assert"));
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const node_net_1 = require("node:net");
const node_test_1 = require("node:test");
const node_url_1 = require("node:url");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const refresh_plan_js_1 = require("../src/engine/taskmap/refresh-plan.js");
const refresh_run_bundle_js_1 = require("../src/engine/taskmap/refresh-run-bundle.js");
const digest = (label) => (0, source_contracts_js_1.taskMapContractDigest)(`refresh-run-bundle-test:${label}`);
function recomputeCheckpointId(checkpoint) {
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
        acceptedSourceIdentityDigests: checkpoint.acceptedSourceIdentityDigests,
        error: checkpoint.error,
    };
    return `tmcheckpoint_${(0, source_contracts_js_1.taskMapContractDigest)(core).slice(0, 16)}`;
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
];
const BINDINGS = [
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
];
function revisionSetsFor(revisions, bindingDigests) {
    return [...bindingDigests].sort().map((bindingDigest) => ({
        bindingDigest,
        revisionSetDigest: (0, source_contracts_js_1.taskMapContractDigest)(revisions
            .filter((revision) => revision.bindingDigest === bindingDigest)
            .map((revision) => ({
            sourceIdentityDigest: revision.sourceIdentityDigest,
            sourceRevisionDigest: revision.sourceRevisionDigest,
            contentDigest: revision.contentDigest,
        }))
            .sort((left, right) => (left.sourceIdentityDigest.localeCompare(right.sourceIdentityDigest)
            || left.sourceRevisionDigest.localeCompare(right.sourceRevisionDigest)
            || left.contentDigest.localeCompare(right.contentDigest)))),
    }));
}
function policyBindings() {
    return [
        "identity",
        "normalization",
        "publication",
        "scheduling",
        "source",
    ].map((name) => ({
        name: `${name}-policy`,
        version: `${name}-policy.1`,
        digest: digest(`policy-${name}`),
    }));
}
function sourceSnapshot(rawMarker) {
    const envelopes = BINDINGS.map((binding, index) => (0, source_contracts_js_1.buildTaskMapSourceEnvelope)({
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
    }));
    return (0, source_contracts_js_1.buildTaskMapSourceSnapshot)(envelopes, []);
}
function checkpointsFor(snapshot) {
    return BINDINGS.map((binding, index) => {
        const bindingDigest = (0, source_contracts_js_1.taskMapContractDigest)(binding);
        const envelope = snapshot.envelopes.find((candidate) => ((0, source_contracts_js_1.taskMapContractDigest)(candidate.binding) === bindingDigest));
        return (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(null, {
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
function lane(value) {
    return { contractVersion: refresh_plan_js_1.TASKMAP_REFRESH_LANE_VERSION, ...value };
}
function planDraft(snapshot, checkpoints) {
    const sourceRevisions = snapshot.envelopes.map((envelope) => ({
        bindingDigest: (0, source_contracts_js_1.taskMapContractDigest)(envelope.binding),
        sourceIdentityDigest: envelope.sourceIdentityDigest,
        sourceRevisionDigest: (0, source_contracts_js_1.taskMapContractDigest)(envelope.sourceRevision),
        contentDigest: envelope.contentDigest,
    }));
    const acceptedSourceRevisions = sourceRevisions.map((revision, index) => ({
        ...revision,
        sourceRevisionDigest: digest(`accepted-revision-${index}`),
        contentDigest: digest(`accepted-content-${index}`),
    }));
    const providers = snapshot.envelopes.map((envelope, index) => {
        const bindingDigest = (0, source_contracts_js_1.taskMapContractDigest)(envelope.binding);
        const checkpoint = checkpoints.find((candidate) => ((0, source_contracts_js_1.taskMapContractDigest)(candidate.binding) === bindingDigest));
        const priorSourceSlice = (0, refresh_run_bundle_js_1.buildTaskMapRefreshRunSourceSliceProof)({
            ownerScopeDigest: snapshot.ownerScopeDigest,
            bindingDigest,
            sourceRevisions: acceptedSourceRevisions.filter((revision) => (revision.bindingDigest === bindingDigest)),
            acceptedSourceIdentityDigests: checkpoint.acceptedSourceIdentityDigests,
        });
        return {
            bindingDigest,
            checkpointDigest: (0, source_contracts_js_1.taskMapContractDigest)(checkpoint),
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
        contractVersion: refresh_plan_js_1.TASKMAP_REFRESH_PLAN_DRAFT_VERSION,
        ownerScopeDigest: snapshot.ownerScopeDigest,
        baseline: {
            kind: "accepted",
            priorCheckpointDigests: providers.map((provider) => provider.checkpointDigest),
            priorSourceSliceDigests: providers.map((provider) => provider.sourceSliceDigest),
            priorProviderArtifacts: providers.map((provider) => ({
                bindingDigest: provider.bindingDigest,
                checkpointDigest: provider.checkpointDigest,
                sourceSliceDigest: provider.sourceSliceDigest,
            })),
            priorAcceptedStateDigest: digest("prior-accepted-state"),
            priorOwnerScopeDigest: snapshot.ownerScopeDigest,
            priorSourceSnapshotDigest: digest("prior-source-snapshot"),
            priorReviewedEvidenceDigest: digest("prior-reviewed-evidence"),
            priorPolicyBundleDigest: (0, source_contracts_js_1.taskMapContractDigest)(policyBindings()),
            priorSemanticImplementationDigest: digest("prior-semantic-implementation"),
            acceptedSourceRevisions,
            acceptedSourceRevisionSets: revisionSetsFor(acceptedSourceRevisions, bindingDigests),
            acceptedSemanticInputDigests: [digest("prior-semantic-input")],
            acceptedDeterministicReplayDigest: digest("prior-replay"),
        },
        reviewedDigests: {
            truthSetDigest: digest("truth-set"),
            reviewBatchDigest: digest("review-batch"),
            reviewAttestationVersion: refresh_plan_js_1.TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION,
            reviewAttestationDigest: digest("review-attestation"),
            sourceManifestDigest: digest("source-manifest"),
        },
        sourceBindings: snapshot.envelopes.map((envelope) => ({
            bindingDigest: (0, source_contracts_js_1.taskMapContractDigest)(envelope.binding),
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
                predecessorLaneIds: providers.map((provider) => provider.normalizeLaneId),
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
function syntheticFixture(includeSourceSnapshot = true, snapshot = sourceSnapshot()) {
    const checkpoints = checkpointsFor(snapshot);
    const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(planDraft(snapshot, checkpoints));
    const laneStates = plan.lanes.map((plannedLane) => ({
        laneId: plannedLane.laneId,
        status: "pending",
    }));
    const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
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
        prepared: (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)(input),
    };
}
function terminalAttemptFixture(status) {
    const base = syntheticFixture();
    const collectLanes = base.plan.lanes.filter((plannedLane) => (plannedLane.outputKinds.includes("connector_checkpoint")
        && plannedLane.outputKinds.includes("source_slice")));
    const priorByBinding = new Map(base.checkpoints.map((checkpoint) => [
        (0, source_contracts_js_1.taskMapContractDigest)(checkpoint.binding),
        checkpoint,
    ]));
    const artifactByBinding = new Map(base.plan.baseline.priorProviderArtifacts.map((artifact) => [
        artifact.bindingDigest,
        artifact,
    ]));
    const attemptCheckpoints = collectLanes.map((plannedLane, index) => {
        const binding = base.plan.sourceBindings.find((candidate) => plannedLane.inputDigests.includes(candidate.bindingDigest));
        const prior = priorByBinding.get(binding.bindingDigest);
        return (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(prior, {
            binding: prior.binding,
            sourceKind: prior.sourceKind,
            adapterVersion: prior.adapterVersion,
            capabilities: prior.capabilities,
            state: status === "succeeded" ? "success" : status,
            attemptedAt: `2026-07-28T1${index}:00:00.000Z`,
            ...(status === "succeeded"
                ? {
                    proposedWatermark: {
                        kind: prior.watermark.kind,
                        valueDigest: digest(`attempt-watermark-${status}-${index}`),
                        observedThrough: `2026-07-28T1${index}:00:00.000Z`,
                    },
                    acceptedSourceIdentityDigests: prior.acceptedSourceIdentityDigests,
                }
                : {
                    errorCode: status === "partial"
                        ? "provider_partial_result"
                        : "provider_unavailable",
                    errorDetailDigest: digest(`terminal-error-${status}-${index}`),
                }),
        });
    });
    const laneStates = base.plan.lanes.map((plannedLane) => {
        const collectIndex = collectLanes.findIndex((candidate) => candidate.laneId === plannedLane.laneId);
        if (collectIndex < 0) {
            return { laneId: plannedLane.laneId, status: "pending" };
        }
        if (status === "succeeded") {
            return { laneId: plannedLane.laneId, status };
        }
        const binding = base.plan.sourceBindings.find((candidate) => plannedLane.inputDigests.includes(candidate.bindingDigest));
        const priorArtifact = artifactByBinding.get(binding.bindingDigest);
        return {
            laneId: plannedLane.laneId,
            status,
            errorCode: status === "partial"
                ? "provider_partial_result"
                : "provider_unavailable",
            errorDetailDigest: digest(`terminal-error-${status}-${collectIndex}`),
            lastGoodCheckpointDigest: priorArtifact.checkpointDigest,
            lastGoodSourceSliceDigest: priorArtifact.sourceSliceDigest,
        };
    });
    const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(base.plan, {
        maxConcurrency: 2,
        laneStates,
    });
    const retainedSourceSlices = status === "succeeded"
        ? []
        : base.plan.sourceBindings.map((binding) => {
            const prior = priorByBinding.get(binding.bindingDigest);
            return (0, refresh_run_bundle_js_1.buildTaskMapRefreshRunSourceSliceProof)({
                ownerScopeDigest: base.plan.ownerScopeDigest,
                bindingDigest: binding.bindingDigest,
                sourceRevisions: base.plan.baseline.acceptedSourceRevisions.filter((revision) => (revision.bindingDigest === binding.bindingDigest)),
                acceptedSourceIdentityDigests: prior.acceptedSourceIdentityDigests,
            });
        });
    const attemptSourceSlices = collectLanes.map((plannedLane, index) => {
        const binding = base.plan.sourceBindings.find((candidate) => plannedLane.inputDigests.includes(candidate.bindingDigest));
        if (status !== "succeeded") {
            return retainedSourceSlices.find((proof) => (proof.bindingDigest === binding.bindingDigest));
        }
        return (0, refresh_run_bundle_js_1.buildTaskMapRefreshRunSourceSliceProof)({
            ownerScopeDigest: base.plan.ownerScopeDigest,
            bindingDigest: binding.bindingDigest,
            sourceRevisions: base.plan.sourceRevisions.filter((revision) => (revision.bindingDigest === binding.bindingDigest)),
            acceptedSourceIdentityDigests: attemptCheckpoints[index].acceptedSourceIdentityDigests,
        });
    });
    const attemptOutputs = collectLanes.map((plannedLane, index) => ({
        laneId: plannedLane.laneId,
        checkpointDigest: (0, source_contracts_js_1.taskMapContractDigest)(attemptCheckpoints[index]),
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
        prepared: (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)(input),
    };
}
function terminalWithoutPriorArtifactFixture(status, baselineKind) {
    const snapshot = sourceSnapshot();
    const priorCheckpoints = checkpointsFor(snapshot);
    const draft = planDraft(snapshot, priorCheckpoints);
    const originalArtifacts = [
        ...draft.baseline.priorProviderArtifacts,
    ];
    const missingBindingDigests = new Set(baselineKind === "genesis"
        ? draft.sourceBindings.map((binding) => binding.bindingDigest)
        : [draft.sourceBindings[0].bindingDigest]);
    const removedArtifacts = originalArtifacts.filter((artifact) => (missingBindingDigests.has(artifact.bindingDigest)));
    const removedInputDigests = new Set(removedArtifacts.flatMap((artifact) => [
        artifact.checkpointDigest,
        artifact.sourceSliceDigest,
    ]));
    for (const plannedLane of draft.lanes) {
        if (plannedLane.inputDigests.some((inputDigest) => (missingBindingDigests.has(inputDigest)))) {
            plannedLane.inputDigests = plannedLane.inputDigests.filter((inputDigest) => !removedInputDigests.has(inputDigest));
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
    }
    else {
        draft.baseline.priorCheckpointDigests =
            draft.baseline.priorCheckpointDigests.filter((digestValue) => (!removedArtifacts.some((artifact) => artifact.checkpointDigest === digestValue)));
        draft.baseline.priorSourceSliceDigests =
            draft.baseline.priorSourceSliceDigests.filter((digestValue) => (!removedArtifacts.some((artifact) => artifact.sourceSliceDigest === digestValue)));
        draft.baseline.priorProviderArtifacts =
            draft.baseline.priorProviderArtifacts.filter((artifact) => (!missingBindingDigests.has(artifact.bindingDigest)));
        draft.baseline.acceptedSourceRevisions =
            draft.baseline.acceptedSourceRevisions.filter((revision) => (!missingBindingDigests.has(revision.bindingDigest)));
        draft.baseline.acceptedSourceRevisionSets =
            draft.baseline.acceptedSourceRevisionSets.filter((revisionSet) => (!missingBindingDigests.has(revisionSet.bindingDigest)));
    }
    const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft);
    const collectLanes = plan.lanes.filter((plannedLane) => (plannedLane.goal === "provider_collect"
        && plannedLane.inputDigests.some((inputDigest) => (missingBindingDigests.has(inputDigest)))));
    const checkpointByBinding = new Map(priorCheckpoints.map((checkpoint) => [
        (0, source_contracts_js_1.taskMapContractDigest)(checkpoint.binding),
        checkpoint,
    ]));
    const attemptCheckpoints = collectLanes.map((plannedLane, index) => {
        const binding = plan.sourceBindings.find((candidate) => (plannedLane.inputDigests.includes(candidate.bindingDigest)));
        const lineage = checkpointByBinding.get(binding.bindingDigest);
        return (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(null, {
            binding: lineage.binding,
            sourceKind: lineage.sourceKind,
            adapterVersion: lineage.adapterVersion,
            capabilities: lineage.capabilities,
            state: status,
            attemptedAt: `2026-07-28T2${index}:00:00.000Z`,
            errorCode: status === "partial"
                ? "provider_partial_result"
                : "provider_unavailable",
            errorDetailDigest: digest(`${baselineKind}-${status}-terminal-error-${index}`),
        });
    });
    const laneStates = plan.lanes.map((plannedLane) => {
        const collectIndex = collectLanes.findIndex((candidate) => candidate.laneId === plannedLane.laneId);
        if (collectIndex < 0) {
            return { laneId: plannedLane.laneId, status: "pending" };
        }
        return {
            laneId: plannedLane.laneId,
            status,
            errorCode: status === "partial"
                ? "provider_partial_result"
                : "provider_unavailable",
            errorDetailDigest: digest(`${baselineKind}-${status}-terminal-error-${collectIndex}`),
        };
    });
    const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
        maxConcurrency: 2,
        laneStates,
    });
    const sourceSliceProofs = collectLanes.map((plannedLane) => {
        const binding = plan.sourceBindings.find((candidate) => (plannedLane.inputDigests.includes(candidate.bindingDigest)));
        return (0, refresh_run_bundle_js_1.buildTaskMapRefreshRunSourceSliceProof)({
            sliceRole: "observed_non_serving",
            ownerScopeDigest: plan.ownerScopeDigest,
            bindingDigest: binding.bindingDigest,
            sourceRevisions: [],
            acceptedSourceIdentityDigests: [],
        });
    });
    const attemptOutputs = collectLanes.map((plannedLane, index) => ({
        laneId: plannedLane.laneId,
        checkpointDigest: (0, source_contracts_js_1.taskMapContractDigest)(attemptCheckpoints[index]),
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
        prepared: (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)(input),
    };
}
function successfulEmptyProviderFixture() {
    const snapshot = sourceSnapshot();
    const priorCheckpoints = checkpointsFor(snapshot);
    const draft = planDraft(snapshot, priorCheckpoints);
    const bindingDigest = draft.sourceBindings[0].bindingDigest;
    const removedArtifact = draft.baseline.priorProviderArtifacts.find((artifact) => artifact.bindingDigest === bindingDigest);
    draft.baseline.priorCheckpointDigests =
        draft.baseline.priorCheckpointDigests.filter((value) => value !== removedArtifact.checkpointDigest);
    draft.baseline.priorSourceSliceDigests =
        draft.baseline.priorSourceSliceDigests.filter((value) => value !== removedArtifact.sourceSliceDigest);
    draft.baseline.priorProviderArtifacts =
        draft.baseline.priorProviderArtifacts.filter((artifact) => artifact.bindingDigest !== bindingDigest);
    draft.baseline.acceptedSourceRevisions =
        draft.baseline.acceptedSourceRevisions.filter((revision) => revision.bindingDigest !== bindingDigest);
    draft.baseline.acceptedSourceRevisionSets =
        draft.baseline.acceptedSourceRevisionSets.filter((revisionSet) => revisionSet.bindingDigest !== bindingDigest);
    draft.sourceRevisions = draft.sourceRevisions.filter((revision) => revision.bindingDigest !== bindingDigest);
    draft.sourceRevisionSets = revisionSetsFor(draft.sourceRevisions, draft.sourceBindings.map((binding) => binding.bindingDigest));
    for (const plannedLane of draft.lanes) {
        if (!plannedLane.inputDigests.includes(bindingDigest))
            continue;
        plannedLane.inputDigests = plannedLane.inputDigests.filter((value) => (value !== removedArtifact.checkpointDigest
            && value !== removedArtifact.sourceSliceDigest));
    }
    const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft);
    const collectLane = plan.lanes.find((plannedLane) => (plannedLane.goal === "provider_collect"
        && plannedLane.inputDigests.includes(bindingDigest)));
    const priorShape = priorCheckpoints.find((checkpoint) => ((0, source_contracts_js_1.taskMapContractDigest)(checkpoint.binding) === bindingDigest));
    const checkpoint = (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(null, {
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
    const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
        maxConcurrency: 2,
        laneStates: plan.lanes.map((plannedLane) => (plannedLane.laneId === collectLane.laneId
            ? { laneId: plannedLane.laneId, status: "succeeded" }
            : { laneId: plannedLane.laneId, status: "pending" })),
    });
    const sourceSlice = (0, refresh_run_bundle_js_1.buildTaskMapRefreshRunSourceSliceProof)({
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
                checkpointDigest: (0, source_contracts_js_1.taskMapContractDigest)(checkpoint),
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
        prepared: (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)(input),
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
        (0, source_contracts_js_1.taskMapContractDigest)(draft.reviewedDigests);
    draft.baseline.priorPolicyBundleDigest =
        (0, source_contracts_js_1.taskMapContractDigest)(draft.policyBindings);
    const probe = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft);
    draft.baseline.priorSemanticImplementationDigest =
        probe.semanticImplementationDigest;
    draft.baseline.priorAcceptedStateDigest =
        probe.candidateAcceptedStateDigest;
    const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft);
    const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
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
        prepared: (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)(input),
    };
}
async function withRunRoot(callback) {
    const canonicalTmp = await (0, promises_1.realpath)((0, node_os_1.tmpdir)());
    const runRoot = await (0, promises_1.mkdtemp)(node_path_1.default.join(canonicalTmp, "taskmap-refresh-run-test-"));
    await (0, promises_1.chmod)(runRoot, DIRECTORY_MODE);
    try {
        return await callback(runRoot);
    }
    finally {
        await (0, promises_1.rm)(runRoot, { recursive: true, force: true });
    }
}
function mode(value) {
    return value.mode & 0o777;
}
function cloneRecord(value) {
    return structuredClone(value);
}
function sha256Text(value) {
    return (0, node_crypto_1.createHash)("sha256").update(value, "utf8").digest("hex");
}
function resealCheckpointArtifact(prepared, mutate) {
    const forged = cloneRecord(prepared);
    const artifact = JSON.parse(forged.members["checkpoints.json"]);
    mutate(artifact);
    artifact.checkpoints.sort((left, right) => (left.checkpoint.checkpointId.localeCompare(right.checkpoint.checkpointId)));
    artifact.checkpointDigests = artifact.checkpoints
        .map((record) => record.checkpointDigest)
        .sort();
    artifact.sourceSlices.sort((left, right) => (left.bindingDigest.localeCompare(right.bindingDigest)
        || left.sourceSliceDigest.localeCompare(right.sourceSliceDigest)));
    artifact.laneReferences.sort((left, right) => (left.laneId.localeCompare(right.laneId)
        || left.referenceKind.localeCompare(right.referenceKind)
        || left.checkpointDigest.localeCompare(right.checkpointDigest)
        || left.sourceSliceDigest.localeCompare(right.sourceSliceDigest)));
    const { checkpointSetId: _checkpointSetId, ...checkpointCore } = artifact;
    artifact.checkpointSetId =
        `tmrefreshcheckpoints_${(0, source_contracts_js_1.taskMapContractDigest)(checkpointCore)}`;
    const checkpointBytes = (0, source_contracts_js_1.taskMapContractCanonicalJson)(artifact);
    forged.members["checkpoints.json"] = checkpointBytes;
    const descriptor = forged.manifest.members.find((member) => member.fileName === "checkpoints.json");
    descriptor.artifactId = artifact.checkpointSetId;
    descriptor.canonicalArtifactDigest = (0, source_contracts_js_1.taskMapContractDigest)(artifact);
    descriptor.byteSha256 = sha256Text(checkpointBytes);
    descriptor.byteLength = Buffer.byteLength(checkpointBytes, "utf8");
    const { bundleId: _bundleId, bundleContentDigest: _bundleContentDigest, ...manifestCore } = forged.manifest;
    const bundleContentDigest = (0, source_contracts_js_1.taskMapContractDigest)(manifestCore);
    forged.bundleId = `tmrefreshrun_${bundleContentDigest}`;
    forged.manifest.bundleId = forged.bundleId;
    forged.manifest.bundleContentDigest = bundleContentDigest;
    forged.commitMarker.bundleId = forged.bundleId;
    forged.commitMarker.manifestByteSha256 = sha256Text((0, source_contracts_js_1.taskMapContractCanonicalJson)(forged.manifest));
    return forged;
}
function resealSourceSnapshotProof(prepared, mutate) {
    const forged = cloneRecord(prepared);
    const proof = JSON.parse(forged.members["source-snapshot.json"]);
    mutate(proof);
    const { sourceSnapshotProofId: _sourceSnapshotProofId, ...proofCore } = proof;
    proof.sourceSnapshotProofId =
        `tmrefreshsnapshotproof_${(0, source_contracts_js_1.taskMapContractDigest)(proofCore)}`;
    const proofBytes = (0, source_contracts_js_1.taskMapContractCanonicalJson)(proof);
    forged.members["source-snapshot.json"] = proofBytes;
    const descriptor = forged.manifest.members.find((member) => member.fileName === "source-snapshot.json");
    descriptor.artifactId = proof.sourceSnapshotProofId;
    descriptor.canonicalArtifactDigest = (0, source_contracts_js_1.taskMapContractDigest)(proof);
    descriptor.byteSha256 = sha256Text(proofBytes);
    descriptor.byteLength = Buffer.byteLength(proofBytes, "utf8");
    const { bundleId: _bundleId, bundleContentDigest: _bundleContentDigest, ...manifestCore } = forged.manifest;
    const bundleContentDigest = (0, source_contracts_js_1.taskMapContractDigest)(manifestCore);
    forged.bundleId = `tmrefreshrun_${bundleContentDigest}`;
    forged.manifest.bundleId = forged.bundleId;
    forged.manifest.bundleContentDigest = bundleContentDigest;
    forged.commitMarker.bundleId = forged.bundleId;
    forged.commitMarker.manifestByteSha256 = sha256Text((0, source_contracts_js_1.taskMapContractCanonicalJson)(forged.manifest));
    return forged;
}
async function expectBundleError(action, codes) {
    let caught;
    try {
        await action;
    }
    catch (error) {
        caught = error;
    }
    node_assert_1.default.ok(caught instanceof refresh_run_bundle_js_1.TaskMapRefreshRunBundleError);
    node_assert_1.default.ok(codes.includes(caught.code), `unexpected bundle error code ${caught.code}`);
    return caught;
}
async function materialized(runRoot, fixture = syntheticFixture()) {
    const result = await (0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, fixture.prepared);
    node_assert_1.default.strictEqual(result.status, "created");
    node_assert_1.default.strictEqual(result.sameUidResidual, false);
    return {
        fixture,
        bundleDirectory: node_path_1.default.join(runRoot, fixture.prepared.bundleId),
    };
}
async function writePreparedBundleUnchecked(runRoot, prepared) {
    const target = node_path_1.default.join(runRoot, prepared.bundleId);
    await (0, promises_1.mkdir)(target, { mode: DIRECTORY_MODE });
    await (0, promises_1.chmod)(target, DIRECTORY_MODE);
    for (const [fileName, bytes] of Object.entries(prepared.members)) {
        await (0, promises_1.writeFile)(node_path_1.default.join(target, fileName), bytes, {
            mode: FILE_MODE,
        });
        await (0, promises_1.chmod)(node_path_1.default.join(target, fileName), FILE_MODE);
    }
    for (const [fileName, bytes] of [
        ["manifest.json", (0, source_contracts_js_1.taskMapContractCanonicalJson)(prepared.manifest)],
        ["COMMITTED", (0, source_contracts_js_1.taskMapContractCanonicalJson)(prepared.commitMarker)],
    ]) {
        await (0, promises_1.writeFile)(node_path_1.default.join(target, fileName), bytes, {
            mode: FILE_MODE,
        });
        await (0, promises_1.chmod)(node_path_1.default.join(target, fileName), FILE_MODE);
    }
    return target;
}
(0, node_test_1.describe)("P10.1B validator seams", () => {
    (0, node_test_1.it)("delegates checkpoint and snapshot validation to the frozen builders", () => {
        const fixture = syntheticFixture();
        node_assert_1.default.deepStrictEqual((0, source_contracts_js_1.assertTaskMapConnectorCheckpoint)(fixture.checkpoints[0]), fixture.checkpoints[0]);
        node_assert_1.default.deepStrictEqual((0, source_contracts_js_1.assertTaskMapSourceSnapshot)(fixture.snapshot), fixture.snapshot);
        const checkpoint = cloneRecord(fixture.checkpoints[0]);
        checkpoint.checkpointId = digest("forged-checkpoint-id");
        node_assert_1.default.throws(() => (0, source_contracts_js_1.assertTaskMapConnectorCheckpoint)(checkpoint), /checkpoint|digest|canonical/i);
        const snapshot = cloneRecord(fixture.snapshot);
        snapshot.sourceSnapshotDigest = digest("forged-snapshot-digest");
        node_assert_1.default.throws(() => (0, source_contracts_js_1.assertTaskMapSourceSnapshot)(snapshot), /snapshot|digest|canonical/i);
    });
    (0, node_test_1.it)("rebuilds the ready batch deterministically and rejects tampering", () => {
        const fixture = syntheticFixture();
        node_assert_1.default.deepStrictEqual((0, refresh_plan_js_1.assertTaskMapReadyBatch)(fixture.plan, fixture.batch), fixture.batch);
        const forged = cloneRecord(fixture.batch);
        forged.batchId = digest("forged-batch");
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.assertTaskMapReadyBatch)(fixture.plan, forged), /batch|canonical|digest/i);
        const unknown = cloneRecord(fixture.batch);
        unknown.fixedNow = "2026-07-28T00:00:00.000Z";
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.assertTaskMapReadyBatch)(fixture.plan, unknown), /unknown|field|batch/i);
    });
});
(0, node_test_1.describe)("P10.1B pure bundle preparation", () => {
    (0, node_test_1.it)("is deterministic across checkpoint permutations", () => {
        const fixture = terminalAttemptFixture("failed");
        const permuted = (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)({
            ...fixture.input,
            connectorCheckpoints: [
                ...fixture.connectorCheckpoints,
            ].reverse(),
            attemptOutputs: [...fixture.attemptOutputs].reverse(),
            sourceSliceProofs: [...fixture.sourceSliceProofs].reverse(),
        });
        node_assert_1.default.deepStrictEqual(permuted, fixture.prepared);
        node_assert_1.default.match(fixture.prepared.bundleId, /^tmrefreshrun_[a-f0-9]{64}$/);
        node_assert_1.default.strictEqual(fixture.prepared.manifest.bundleContentDigest, fixture.prepared.bundleId.slice("tmrefreshrun_".length));
    });
    (0, node_test_1.it)("closes success, partial, and failed attempt outputs independently from retained last-good refs", () => {
        for (const status of [
            "succeeded",
            "partial",
            "failed",
        ]) {
            const fixture = terminalAttemptFixture(status);
            const bytes = fixture.prepared.members["checkpoints.json"];
            const artifact = JSON.parse(bytes);
            const attempts = artifact.laneReferences.filter((reference) => reference.referenceKind === "attempt_output");
            const retained = artifact.laneReferences.filter((reference) => reference.referenceKind === "retained_last_good");
            node_assert_1.default.strictEqual(attempts.length, 2);
            node_assert_1.default.strictEqual(retained.length, status === "succeeded" ? 0 : 2);
            if (status !== "succeeded") {
                node_assert_1.default.strictEqual(fixture.batch.publication.eligible, false);
                node_assert_1.default.strictEqual(fixture.batch.publication.state, "blocked");
                node_assert_1.default.notDeepStrictEqual(fixture.plan.sourceRevisions, fixture.plan.baseline.acceptedSourceRevisions);
                node_assert_1.default.ok(attempts.every((attempt) => (retained.some((lastGood) => (lastGood.laneId === attempt.laneId
                    && lastGood.sourceSliceDigest === attempt.sourceSliceDigest
                    && lastGood.checkpointDigest !== attempt.checkpointDigest)))));
            }
            node_assert_1.default.ok(attempts.every((reference) => fixture.attemptOutputs.some((output) => (output.checkpointDigest === reference.checkpointDigest
                && output.sourceSliceDigest === reference.sourceSliceDigest))));
            node_assert_1.default.deepStrictEqual(artifact.checkpointDigests, fixture.connectorCheckpoints
                .map((checkpoint) => (0, source_contracts_js_1.taskMapContractDigest)(checkpoint))
                .sort());
            node_assert_1.default.deepStrictEqual(artifact.sourceSlices.map((proof) => proof.sourceSliceDigest).sort(), fixture.sourceSliceProofs
                .map((proof) => proof.sourceSliceDigest)
                .sort());
            const expectedState = status === "succeeded" ? "success" : status;
            node_assert_1.default.strictEqual(artifact.checkpoints.filter((record) => record.checkpoint.state === expectedState).length, 2);
            node_assert_1.default.throws(() => (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)({
                ...fixture.input,
                connectorCheckpoints: fixture.connectorCheckpoints.slice(1),
            }), /checkpoint|resolve|referenc/i);
            const forgedSlice = cloneRecord(fixture.sourceSliceProofs[0]);
            forgedSlice.sourceSliceDigest = digest(`forged-slice-${status}`);
            node_assert_1.default.throws(() => (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)({
                ...fixture.input,
                sourceSliceProofs: [
                    forgedSlice,
                    ...fixture.sourceSliceProofs.slice(1),
                ],
            }), /source.slice|digest|derived/i);
            node_assert_1.default.throws(() => (0, refresh_run_bundle_js_1.buildTaskMapRefreshRunSourceSliceProof)({
                ownerScopeDigest: fixture.plan.ownerScopeDigest,
                bindingDigest: fixture.sourceSliceProofs[0].bindingDigest,
                sourceRevisions: fixture.sourceSliceProofs[0].sourceRevisions,
                acceptedSourceIdentityDigests: [digest(`forged-accepted-identity-${status}`)],
            }), /accepted|identit|revision/i);
        }
    });
    (0, node_test_1.it)("serializes genesis and new-binding partial or failed attempts as empty non-serving proofs", () => {
        for (const baselineKind of [
            "genesis",
            "accepted_new_binding",
        ]) {
            for (const status of ["partial", "failed"]) {
                const fixture = terminalWithoutPriorArtifactFixture(status, baselineKind);
                const artifact = JSON.parse(fixture.prepared.members["checkpoints.json"]);
                node_assert_1.default.strictEqual(fixture.batch.publication.eligible, false);
                node_assert_1.default.strictEqual(fixture.batch.publication.state, "blocked");
                node_assert_1.default.ok(artifact.laneReferences.every((reference) => reference.referenceKind === "attempt_output"));
                node_assert_1.default.ok(artifact.checkpoints.every((record) => (record.checkpoint.state === status
                    && record.checkpoint.watermark === undefined
                    && record.checkpoint.lastSuccessfulPollAt === undefined
                    && record.checkpoint.acceptedSourceIdentityDigests.length === 0)));
                node_assert_1.default.ok(artifact.sourceSlices.every((proof) => (proof.sliceRole === "observed_non_serving"
                    && proof.sourceRevisions.length === 0
                    && proof.acceptedSourceIdentityDigests.length === 0)));
            }
        }
    });
    (0, node_test_1.it)("serializes a successful empty provider output as an empty serving proof", () => {
        const fixture = successfulEmptyProviderFixture();
        const artifact = JSON.parse(fixture.prepared.members["checkpoints.json"]);
        node_assert_1.default.strictEqual(artifact.checkpoints.length, 1);
        node_assert_1.default.strictEqual(artifact.checkpoints[0].checkpoint.state, "success");
        node_assert_1.default.deepStrictEqual(artifact.checkpoints[0].checkpoint
            .acceptedSourceIdentityDigests, []);
        node_assert_1.default.deepStrictEqual(artifact.sourceSlices, [{
                ...fixture.sourceSlice,
            }]);
        node_assert_1.default.strictEqual(artifact.sourceSlices[0].sliceRole, "serving");
        node_assert_1.default.deepStrictEqual(artifact.sourceSlices[0].sourceRevisions, []);
        node_assert_1.default.deepStrictEqual(artifact.sourceSlices[0].acceptedSourceIdentityDigests, []);
        node_assert_1.default.deepStrictEqual(artifact.laneReferences.map((reference) => reference.referenceKind), ["attempt_output"]);
    });
    (0, node_test_1.it)("serializes an exact no-op without inventing attempts or publication", () => {
        const fixture = exactNoOpFixture();
        node_assert_1.default.strictEqual(fixture.plan.isExactNoOp, true);
        node_assert_1.default.strictEqual(fixture.plan.candidateAcceptedStateDigest, fixture.plan.baseline.priorAcceptedStateDigest);
        node_assert_1.default.strictEqual(fixture.batch.publication.state, "no_op");
        node_assert_1.default.strictEqual(fixture.batch.publication.eligible, false);
        node_assert_1.default.deepStrictEqual(fixture.batch.selectedLaneIds, []);
        const artifact = JSON.parse(fixture.prepared.members["checkpoints.json"]);
        node_assert_1.default.deepStrictEqual(artifact.checkpoints, []);
        node_assert_1.default.deepStrictEqual(artifact.sourceSlices, []);
        node_assert_1.default.deepStrictEqual(artifact.laneReferences, []);
    });
    (0, node_test_1.it)("rejects relabeling a baseline checkpoint as a new successful attempt", () => {
        const fixture = terminalAttemptFixture("succeeded");
        const firstAttempt = fixture.attemptCheckpoints[0];
        const bindingDigest = (0, source_contracts_js_1.taskMapContractDigest)(firstAttempt.binding);
        const prior = fixture.checkpoints.find((checkpoint) => ((0, source_contracts_js_1.taskMapContractDigest)(checkpoint.binding) === bindingDigest));
        const forgedAttemptOutputs = fixture.attemptOutputs.map((output, index) => index === 0
            ? {
                ...output,
                checkpointDigest: (0, source_contracts_js_1.taskMapContractDigest)(prior),
            }
            : output);
        node_assert_1.default.throws(() => (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)({
            ...fixture.input,
            connectorCheckpoints: [
                prior,
                ...fixture.attemptCheckpoints.slice(1),
            ],
            attemptOutputs: forgedAttemptOutputs,
        }), /attempt-output checkpoint must be new|baseline/i);
    });
    (0, node_test_1.it)("rejects self-valid failed attempts that drop or roll back retained checkpoint state", () => {
        for (const mutation of ["drop", "rollback"]) {
            const fixture = terminalAttemptFixture("failed");
            const original = fixture.attemptCheckpoints[0];
            const forged = cloneRecord(original);
            if (mutation === "drop") {
                delete forged.lastSuccessfulPollAt;
                delete forged.watermark;
                forged.watermarkHistoryDigests = [];
            }
            else {
                forged.watermark = {
                    kind: original.watermark.kind,
                    valueDigest: digest("rolled-back-watermark"),
                    observedThrough: original.watermark.observedThrough,
                };
                forged.watermarkHistoryDigests = [
                    forged.watermark.valueDigest,
                ];
            }
            forged.checkpointId = recomputeCheckpointId(forged);
            node_assert_1.default.deepStrictEqual((0, source_contracts_js_1.assertTaskMapConnectorCheckpoint)(forged), forged);
            const originalDigest = (0, source_contracts_js_1.taskMapContractDigest)(original);
            const forgedDigest = (0, source_contracts_js_1.taskMapContractDigest)(forged);
            node_assert_1.default.throws(() => (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)({
                ...fixture.input,
                connectorCheckpoints: fixture.connectorCheckpoints.map((checkpoint) => ((0, source_contracts_js_1.taskMapContractDigest)(checkpoint) === originalDigest
                    ? forged
                    : checkpoint)),
                attemptOutputs: fixture.attemptOutputs.map((output) => (output.checkpointDigest === originalDigest
                    ? { ...output, checkpointDigest: forgedDigest }
                    : output)),
            }), /rolls back retained checkpoint state/i);
        }
    });
    (0, node_test_1.it)("keeps a self-valid non-monotonic success audit-only for P10.1C transition validation", () => {
        const fixture = terminalAttemptFixture("succeeded");
        const original = fixture.attemptCheckpoints[0];
        const bindingDigest = (0, source_contracts_js_1.taskMapContractDigest)(original.binding);
        const prior = fixture.checkpoints.find((checkpoint) => ((0, source_contracts_js_1.taskMapContractDigest)(checkpoint.binding) === bindingDigest));
        const auditOnly = cloneRecord(original);
        auditOnly.lastAttemptAt = "2026-07-28T02:00:00.000Z";
        auditOnly.lastSuccessfulPollAt = "2026-07-28T02:00:00.000Z";
        auditOnly.watermark.observedThrough =
            "2026-07-28T02:00:00.000Z";
        auditOnly.checkpointId = recomputeCheckpointId(auditOnly);
        node_assert_1.default.ok(auditOnly.lastAttemptAt < prior.lastAttemptAt);
        node_assert_1.default.deepStrictEqual((0, source_contracts_js_1.assertTaskMapConnectorCheckpoint)(auditOnly), auditOnly);
        const originalDigest = (0, source_contracts_js_1.taskMapContractDigest)(original);
        const auditOnlyDigest = (0, source_contracts_js_1.taskMapContractDigest)(auditOnly);
        const prepared = (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)({
            ...fixture.input,
            connectorCheckpoints: fixture.connectorCheckpoints.map((checkpoint) => ((0, source_contracts_js_1.taskMapContractDigest)(checkpoint) === originalDigest
                ? auditOnly
                : checkpoint)),
            attemptOutputs: fixture.attemptOutputs.map((output) => (output.checkpointDigest === originalDigest
                ? { ...output, checkpointDigest: auditOnlyDigest }
                : output)),
        });
        node_assert_1.default.match(prepared.bundleId, /^tmrefreshrun_[a-f0-9]{64}$/);
        // P10.1B intentionally proves only self-consistency. P10.1C must resolve
        // `prior` from accepted history and reject this lifecycle transition
        // before any CAS/current-ref promotion.
    });
    (0, node_test_1.it)("bounds huge keys, accessors, and proxies without reading untrusted properties", () => {
        const huge = Object.fromEntries(Array.from({
            length: refresh_run_bundle_js_1.TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxObjectKeys + 1,
        }, (_, index) => [`key-${index}`, index]));
        node_assert_1.default.throws(() => (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)(huge), /object-key bound/i);
        let accessorReads = 0;
        const accessorInput = Object.create(null);
        Object.defineProperty(accessorInput, "plan", {
            enumerable: true,
            get: () => {
                accessorReads += 1;
                return syntheticFixture().plan;
            },
        });
        node_assert_1.default.throws(() => (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)(accessorInput), /accessor|hidden/i);
        node_assert_1.default.strictEqual(accessorReads, 0);
        let proxyReads = 0;
        const proxy = new Proxy(syntheticFixture().input, {
            get(target, property, receiver) {
                proxyReads += 1;
                return Reflect.get(target, property, receiver);
            },
        });
        node_assert_1.default.throws(() => (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)(proxy), /snapshot|plain JSON|clone/i);
        node_assert_1.default.strictEqual(proxyReads, 0);
    });
    (0, node_test_1.it)("persists only a digest proof for the optional source snapshot", () => {
        const fixture = syntheticFixture();
        const proofBytes = fixture.prepared.members["source-snapshot.json"];
        node_assert_1.default.ok(proofBytes);
        const proof = JSON.parse(proofBytes);
        node_assert_1.default.strictEqual(proof.ownerScopeDigest, fixture.plan.ownerScopeDigest);
        node_assert_1.default.strictEqual(proof.snapshotId, fixture.snapshot.snapshotId);
        node_assert_1.default.strictEqual(proof.sourceBindingCount, 2);
        node_assert_1.default.strictEqual(proof.sourceRevisionCount, 2);
        node_assert_1.default.strictEqual(proof.privacy.rawSourceObjectIdentifiersStored, false);
        for (const envelope of fixture.snapshot.envelopes) {
            node_assert_1.default.ok(!proofBytes.includes(envelope.sourceObjectId));
            node_assert_1.default.ok(!proofBytes.includes(envelope.sourceRevision));
            node_assert_1.default.ok(!proofBytes.includes(envelope.binding.connectionId));
        }
        node_assert_1.default.ok(!proofBytes.includes("\"envelopes\""));
        node_assert_1.default.ok(!proofBytes.includes("\"discoveryPointers\""));
    });
    (0, node_test_1.it)("keeps raw/body/source/revision sentinels out of every member and rejects known credential forms", () => {
        const snapshot = sourceSnapshot("BODY_PRIVATE_SENTINEL");
        const fixture = syntheticFixture(true, snapshot);
        const persistedByFile = {
            ...fixture.prepared.members,
            "manifest.json": (0, source_contracts_js_1.taskMapContractCanonicalJson)(fixture.prepared.manifest),
            COMMITTED: (0, source_contracts_js_1.taskMapContractCanonicalJson)(fixture.prepared.commitMarker),
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
                node_assert_1.default.ok(!bytes.includes(sentinel), `${fileName} retained a forbidden sentinel`);
            }
        }
        const secretCheckpoint = (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(null, {
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
        node_assert_1.default.doesNotThrow(() => (0, source_contracts_js_1.assertTaskMapConnectorCheckpoint)(secretCheckpoint));
        node_assert_1.default.throws(() => (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)({
            ...fixture.input,
            connectorCheckpoints: [secretCheckpoint],
        }), /known sensitive string form/i);
    });
    (0, node_test_1.it)("rejects forged cross-file plan, batch, checkpoints, and snapshots", () => {
        const fixture = syntheticFixture();
        const forgedPlan = cloneRecord(fixture.plan);
        forgedPlan.candidateAcceptedStateDigest = digest("forged-candidate");
        node_assert_1.default.throws(() => (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)({
            ...fixture.input,
            plan: forgedPlan,
        }), /plan|candidate|digest|canonical/i);
        const alternateDraft = planDraft(fixture.snapshot, fixture.checkpoints);
        alternateDraft.deterministicReplayDigest = digest("alternate-replay");
        const alternatePlan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(alternateDraft);
        const alternateBatch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(alternatePlan, {
            maxConcurrency: 2,
            laneStates: alternatePlan.lanes.map((plannedLane) => ({
                laneId: plannedLane.laneId,
                status: "pending",
            })),
        });
        node_assert_1.default.throws(() => (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)({
            ...fixture.input,
            batch: alternateBatch,
        }), /batch|plan|canonical/i);
        const forgedCheckpoint = cloneRecord(fixture.checkpoints[0]);
        forgedCheckpoint.acceptedSourceIdentityDigests = [digest("forged-source")];
        node_assert_1.default.throws(() => (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)({
            ...fixture.input,
            connectorCheckpoints: [
                forgedCheckpoint,
                fixture.checkpoints[1],
            ],
        }), /checkpoint|digest|canonical/i);
        node_assert_1.default.throws(() => (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)({
            ...fixture.input,
            connectorCheckpoints: [fixture.checkpoints[0]],
        }), /checkpoint|resolve|referenc/i);
        node_assert_1.default.throws(() => (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)({
            ...fixture.input,
            connectorCheckpoints: [
                ...fixture.checkpoints,
                (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(null, {
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
        }), /checkpoint|resolve|referenc/i);
        const forgedSnapshot = cloneRecord(fixture.snapshot);
        forgedSnapshot.ownerScopeDigest = digest("different-owner");
        node_assert_1.default.throws(() => (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)({
            ...fixture.input,
            sourceSnapshot: forgedSnapshot,
        }), /snapshot|owner|digest|canonical/i);
    });
    (0, node_test_1.it)("enforces exact 4 MiB member and 16 MiB aggregate byte bounds", () => {
        const maxMember = refresh_run_bundle_js_1.TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxMemberBytes;
        const maxTotal = refresh_run_bundle_js_1.TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxTotalBytes;
        node_assert_1.default.strictEqual(maxMember, 4 * 1024 * 1024);
        node_assert_1.default.strictEqual(maxTotal, 16 * 1024 * 1024);
        node_assert_1.default.doesNotThrow(() => (0, refresh_run_bundle_js_1.assertTaskMapRefreshRunBundleByteLimits)([maxMember]));
        node_assert_1.default.doesNotThrow(() => (0, refresh_run_bundle_js_1.assertTaskMapRefreshRunBundleByteLimits)([
            maxMember,
            maxMember,
            maxMember,
            maxMember,
        ]));
        node_assert_1.default.throws(() => (0, refresh_run_bundle_js_1.assertTaskMapRefreshRunBundleByteLimits)([maxMember + 1]), /member|byte|bound/i);
        node_assert_1.default.throws(() => (0, refresh_run_bundle_js_1.assertTaskMapRefreshRunBundleByteLimits)([
            maxMember,
            maxMember,
            maxMember,
            maxMember,
            1,
        ]), /aggregate|total|bound/i);
    });
});
(0, node_test_1.describe)("P10.1B immutable filesystem materialization", () => {
    (0, node_test_1.it)("verifies the fixed-byte golden v1 bundle without current builders", async () => {
        const fixturePath = node_path_1.default.resolve("tests/fixtures/taskmap-p10.1b/golden-v1.json");
        const golden = JSON.parse(await (0, promises_1.readFile)(fixturePath, "utf8"));
        node_assert_1.default.strictEqual(golden.fixtureVersion, "taskmap-refresh-run-golden-fixture.v1");
        node_assert_1.default.strictEqual(golden.expectedContractVersion, "taskmap-refresh-run-bundle.v1");
        node_assert_1.default.deepStrictEqual(Object.keys(golden.files).sort(), [...CLOSED_FILES].sort());
        const exactBytes = Object.fromEntries(Object.entries(golden.files).map(([fileName, base64]) => {
            const bytes = Buffer.from(base64, "base64").toString("utf8");
            node_assert_1.default.strictEqual(Buffer.from(bytes, "utf8").toString("base64"), base64, `${fileName} has non-canonical fixture encoding`);
            node_assert_1.default.ok(!bytes.endsWith("\n"), `${fileName} gained a trailing newline`);
            return [fileName, bytes];
        }));
        const manifest = JSON.parse(exactBytes["manifest.json"]);
        const marker = JSON.parse(exactBytes.COMMITTED);
        node_assert_1.default.strictEqual(manifest.contractVersion, golden.expectedContractVersion);
        node_assert_1.default.strictEqual(manifest.bundleId, golden.expectedBundleId);
        node_assert_1.default.strictEqual(marker.bundleId, golden.expectedBundleId);
        node_assert_1.default.strictEqual(marker.manifestByteSha256, golden.expectedManifestByteSha256);
        node_assert_1.default.strictEqual(sha256Text(exactBytes["manifest.json"]), golden.expectedManifestByteSha256);
        await withRunRoot(async (runRoot) => {
            const target = node_path_1.default.join(runRoot, golden.expectedBundleId);
            await (0, promises_1.mkdir)(target, { mode: DIRECTORY_MODE });
            await (0, promises_1.chmod)(target, DIRECTORY_MODE);
            for (const [fileName, bytes] of Object.entries(exactBytes)) {
                await (0, promises_1.writeFile)(node_path_1.default.join(target, fileName), bytes, {
                    mode: FILE_MODE,
                });
                await (0, promises_1.chmod)(node_path_1.default.join(target, fileName), FILE_MODE);
            }
            const verified = await (0, refresh_run_bundle_js_1.verifyTaskMapRefreshRunBundle)(target);
            node_assert_1.default.strictEqual(verified.bundleId, golden.expectedBundleId);
            node_assert_1.default.strictEqual(verified.manifest.contractVersion, golden.expectedContractVersion);
        });
        // If a semantic validator change makes these historical v1 bytes invalid,
        // bump the affected contract version; never silently replace this fixture.
        // 2026-08-04: fixture explicitly re-cut from exactNoOpFixture() after the
        // canonical key sort moved from localeCompare to Unicode scalar order to
        // match the Swift reader (the old locale-dependent bytes were themselves
        // the bug — no healthy v1 bundles existed outside this fixture). Semantic
        // content is unchanged; only key order and derived digests differ.
    });
    (0, node_test_1.it)("creates, verifies, permissions, canonical no-newline bytes, and retries", async () => {
        await withRunRoot(async (runRoot) => {
            const { fixture, bundleDirectory } = await materialized(runRoot);
            node_assert_1.default.strictEqual(mode(await (0, promises_1.stat)(bundleDirectory)), DIRECTORY_MODE);
            node_assert_1.default.deepStrictEqual((await (0, promises_1.readdir)(bundleDirectory)).sort(), [
                ...CLOSED_FILES,
            ]);
            for (const fileName of CLOSED_FILES) {
                const filePath = node_path_1.default.join(bundleDirectory, fileName);
                node_assert_1.default.strictEqual(mode(await (0, promises_1.stat)(filePath)), FILE_MODE);
                const bytes = await (0, promises_1.readFile)(filePath);
                node_assert_1.default.ok(bytes.length > 0);
                node_assert_1.default.notStrictEqual(bytes.at(-1), 0x0a);
                const parsed = JSON.parse(bytes.toString("utf8"));
                node_assert_1.default.strictEqual(bytes.toString("utf8"), (0, source_contracts_js_1.taskMapContractCanonicalJson)(parsed));
            }
            const verified = await (0, refresh_run_bundle_js_1.verifyTaskMapRefreshRunBundle)(bundleDirectory, fixture.prepared.bundleId);
            node_assert_1.default.strictEqual(verified.bundleId, fixture.prepared.bundleId);
            node_assert_1.default.deepStrictEqual(verified.plan, fixture.plan);
            node_assert_1.default.deepStrictEqual(verified.batch, fixture.batch);
            node_assert_1.default.ok(verified.sourceSnapshotProof);
            const retry = await (0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, fixture.prepared);
            node_assert_1.default.strictEqual(retry.status, "already_present");
            node_assert_1.default.strictEqual(retry.sameUidResidual, false);
        });
    });
    (0, node_test_1.it)("keeps COMMITTED last and never exposes a partial final directory", async () => {
        await withRunRoot(async (runRoot) => {
            const fixture = syntheticFixture();
            let releaseManifest;
            let sawManifest;
            const manifestReached = new Promise((resolve) => {
                sawManifest = resolve;
            });
            const manifestRelease = new Promise((resolve) => {
                releaseManifest = resolve;
            });
            const first = (0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, fixture.prepared, {
                faultInjection: async (point) => {
                    if (point === "after_manifest") {
                        sawManifest();
                        await manifestRelease;
                    }
                },
            });
            await manifestReached;
            const finalDirectory = node_path_1.default.join(runRoot, fixture.prepared.bundleId);
            let finalNames;
            try {
                finalNames = await (0, promises_1.readdir)(finalDirectory);
            }
            catch (error) {
                const code = error.code;
                node_assert_1.default.ok(code === "ENOENT" || code === "ENOTDIR");
            }
            node_assert_1.default.ok(finalNames === undefined
                || finalNames.length === 0
                || (0, source_contracts_js_1.taskMapContractCanonicalJson)([...finalNames].sort())
                    === (0, source_contracts_js_1.taskMapContractCanonicalJson)([...CLOSED_FILES]));
            const rootNames = await (0, promises_1.readdir)(runRoot);
            const staging = rootNames.filter((name) => name.startsWith(".tmrefreshrun-stage-"));
            node_assert_1.default.ok(staging.length >= 1);
            for (const stageName of staging) {
                const stageFiles = await (0, promises_1.readdir)(node_path_1.default.join(runRoot, stageName));
                node_assert_1.default.ok(!stageFiles.includes("COMMITTED"));
            }
            const second = (0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, fixture.prepared);
            releaseManifest();
            const results = await Promise.all([first, second]);
            node_assert_1.default.deepStrictEqual(results.map((result) => result.status).sort(), ["already_present", "created"]);
            node_assert_1.default.strictEqual(results.find((result) => result.status === "created")
                .sameUidResidual, false);
            node_assert_1.default.strictEqual(results.find((result) => result.status === "already_present")
                .sameUidResidual, true);
            node_assert_1.default.deepStrictEqual((await (0, promises_1.readdir)(finalDirectory)).sort(), [
                ...CLOSED_FILES,
            ]);
        });
    });
    (0, node_test_1.it)("preserves a marker-last fault residual without publishing a partial run", async () => {
        await withRunRoot(async (runRoot) => {
            const fixture = syntheticFixture();
            const failure = expectBundleError((0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, fixture.prepared, {
                faultInjection: (point) => {
                    if (point === "after_manifest") {
                        throw new Error("synthetic fault after manifest");
                    }
                },
            }), ["write_failed"]);
            const error = await failure;
            node_assert_1.default.strictEqual(error.sameUidResidual, true);
            const names = await (0, promises_1.readdir)(runRoot);
            const staging = names.filter((name) => name.startsWith(".tmrefreshrun-stage-"));
            node_assert_1.default.ok(staging.length >= 1);
            node_assert_1.default.ok(!names.includes(fixture.prepared.bundleId));
            for (const stageName of staging) {
                const stageFiles = await (0, promises_1.readdir)(node_path_1.default.join(runRoot, stageName));
                node_assert_1.default.ok(stageFiles.includes("manifest.json"));
                node_assert_1.default.ok(!stageFiles.includes("COMMITTED"));
            }
        });
    });
    (0, node_test_1.it)("preserves a synthetic partial member write only in staging", async () => {
        await withRunRoot(async (runRoot) => {
            const fixture = syntheticFixture();
            const partialBytes = fixture.prepared.members["plan.json"]
                .slice(0, 97);
            const error = await expectBundleError((0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, fixture.prepared, {
                faultInjection: async (point) => {
                    if (point !== "after_plan")
                        return;
                    const stageName = (await (0, promises_1.readdir)(runRoot)).find((name) => (name.startsWith(".tmrefreshrun-stage-")));
                    const planPath = node_path_1.default.join(runRoot, stageName, "plan.json");
                    await (0, promises_1.writeFile)(planPath, partialBytes, { mode: FILE_MODE });
                    await (0, promises_1.chmod)(planPath, FILE_MODE);
                    throw new Error("synthetic partial member write");
                },
            }), ["write_failed"]);
            node_assert_1.default.strictEqual(error.sameUidResidual, true);
            const names = await (0, promises_1.readdir)(runRoot);
            node_assert_1.default.ok(!names.includes(fixture.prepared.bundleId));
            const stageName = names.find((name) => name.startsWith(".tmrefreshrun-stage-"));
            node_assert_1.default.strictEqual(await (0, promises_1.readFile)(node_path_1.default.join(runRoot, stageName, "plan.json"), "utf8"), partialBytes);
            node_assert_1.default.ok(!(await (0, promises_1.readdir)(node_path_1.default.join(runRoot, stageName)))
                .includes("COMMITTED"));
        });
    });
    (0, node_test_1.it)("reports immutable residuals for every post-stage fault point", async () => {
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
        ];
        for (const faultPoint of faultPoints) {
            await withRunRoot(async (runRoot) => {
                const fixture = syntheticFixture();
                const error = await expectBundleError((0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, fixture.prepared, {
                    faultInjection: (point) => {
                        if (point === faultPoint) {
                            throw new Error(`synthetic fault at ${faultPoint}`);
                        }
                    },
                }), ["write_failed"]);
                node_assert_1.default.strictEqual(error.sameUidResidual, true);
                const names = await (0, promises_1.readdir)(runRoot);
                node_assert_1.default.ok(names.some((name) => (name.startsWith(".tmrefreshrun-stage-")
                    || name === fixture.prepared.bundleId)));
            });
        }
    });
    (0, node_test_1.it)("hardens staging, reservation, and files under umask 0777", async () => {
        await withRunRoot(async (runRoot) => {
            const fixture = syntheticFixture();
            const moduleUrl = (0, node_url_1.pathToFileURL)(node_path_1.default.resolve(process.cwd(), "dist/src/engine/taskmap/refresh-run-bundle.js")).href;
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
            const child = (0, node_child_process_1.spawnSync)(process.execPath, ["--input-type=module", "-e", program, moduleUrl], {
                encoding: "utf8",
                input: JSON.stringify({
                    runRoot,
                    prepared: fixture.prepared,
                }),
            });
            node_assert_1.default.strictEqual(child.status, 0, child.stderr);
            const result = JSON.parse(child.stdout);
            node_assert_1.default.deepStrictEqual(result, {
                status: "created",
                bundleId: fixture.prepared.bundleId,
                sameUidResidual: false,
            });
            const bundleDirectory = node_path_1.default.join(runRoot, fixture.prepared.bundleId);
            node_assert_1.default.strictEqual(mode(await (0, promises_1.stat)(bundleDirectory)), DIRECTORY_MODE);
            for (const fileName of CLOSED_FILES) {
                node_assert_1.default.strictEqual(mode(await (0, promises_1.stat)(node_path_1.default.join(bundleDirectory, fileName))), FILE_MODE);
            }
        });
    });
    (0, node_test_1.it)("rejects tamper, extra members, and missing members", async () => {
        await withRunRoot(async (runRoot) => {
            const { bundleDirectory } = await materialized(runRoot);
            await (0, promises_1.writeFile)(node_path_1.default.join(bundleDirectory, "plan.json"), `${await (0, promises_1.readFile)(node_path_1.default.join(bundleDirectory, "plan.json"), "utf8")} `);
            await expectBundleError((0, refresh_run_bundle_js_1.verifyTaskMapRefreshRunBundle)(bundleDirectory), ["bundle_corrupt", "unsafe_target"]);
        });
        await withRunRoot(async (runRoot) => {
            const { bundleDirectory } = await materialized(runRoot);
            await (0, promises_1.writeFile)(node_path_1.default.join(bundleDirectory, "unknown.json"), "{}", { mode: FILE_MODE });
            await expectBundleError((0, refresh_run_bundle_js_1.verifyTaskMapRefreshRunBundle)(bundleDirectory), ["bundle_corrupt", "invalid_contract"]);
        });
        await withRunRoot(async (runRoot) => {
            const { bundleDirectory } = await materialized(runRoot);
            await (0, promises_1.unlink)(node_path_1.default.join(bundleDirectory, "batch.json"));
            await expectBundleError((0, refresh_run_bundle_js_1.verifyTaskMapRefreshRunBundle)(bundleDirectory), ["bundle_corrupt", "invalid_contract"]);
        });
        await withRunRoot(async (runRoot) => {
            const { bundleDirectory } = await materialized(runRoot);
            const markerPath = node_path_1.default.join(bundleDirectory, "COMMITTED");
            const marker = JSON.parse(await (0, promises_1.readFile)(markerPath, "utf8"));
            marker.manifestByteSha256 = digest("forged-manifest-byte-digest");
            await (0, promises_1.writeFile)(markerPath, (0, source_contracts_js_1.taskMapContractCanonicalJson)(marker));
            await expectBundleError((0, refresh_run_bundle_js_1.verifyTaskMapRefreshRunBundle)(bundleDirectory), ["bundle_corrupt", "invalid_contract"]);
        });
    });
    (0, node_test_1.it)("rejects nested checkpoint and source-slice artifact forgery", async () => {
        const mutations = [
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
                await (0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, fixture.prepared);
                const bundleDirectory = node_path_1.default.join(runRoot, fixture.prepared.bundleId);
                const checkpointsPath = node_path_1.default.join(bundleDirectory, "checkpoints.json");
                const artifact = JSON.parse(await (0, promises_1.readFile)(checkpointsPath, "utf8"));
                mutate(artifact);
                await (0, promises_1.writeFile)(checkpointsPath, (0, source_contracts_js_1.taskMapContractCanonicalJson)(artifact));
                await node_assert_1.default.rejects(() => (0, refresh_run_bundle_js_1.verifyTaskMapRefreshRunBundle)(bundleDirectory), /checkpoint|source.slice|digest|identit|derived|invalid/i);
            });
        }
    });
    (0, node_test_1.it)("rejects forged source-snapshot IDs and privacy claims", async () => {
        for (const mutation of ["snapshot_id", "privacy"]) {
            await withRunRoot(async (runRoot) => {
                if (mutation === "snapshot_id") {
                    const fixture = syntheticFixture();
                    const forged = resealSourceSnapshotProof(fixture.prepared, (proof) => {
                        proof.snapshotId = "tmsnapshot_0000000000000000";
                    });
                    const target = await writePreparedBundleUnchecked(runRoot, forged);
                    await node_assert_1.default.rejects(() => (0, refresh_run_bundle_js_1.verifyTaskMapRefreshRunBundle)(target), /source-snapshot ID is not derived/i);
                    return;
                }
                const { bundleDirectory } = await materialized(runRoot);
                const proofPath = node_path_1.default.join(bundleDirectory, "source-snapshot.json");
                const proof = JSON.parse(await (0, promises_1.readFile)(proofPath, "utf8"));
                proof.privacy.sourceBodiesStored = true;
                await (0, promises_1.writeFile)(proofPath, (0, source_contracts_js_1.taskMapContractCanonicalJson)(proof));
                await node_assert_1.default.rejects(() => (0, refresh_run_bundle_js_1.verifyTaskMapRefreshRunBundle)(bundleDirectory), /source-snapshot|snapshot ID|privacy|private source/i);
            });
        }
    });
    (0, node_test_1.it)("rejects recomputed duplicate attempt roles for one provider lane", async () => {
        const fixture = terminalAttemptFixture("succeeded");
        const reference = JSON.parse(fixture.prepared.members["checkpoints.json"]).laneReferences.find((candidate) => (candidate.referenceKind === "attempt_output"));
        const original = fixture.attemptCheckpoints.find((checkpoint) => ((0, source_contracts_js_1.taskMapContractDigest)(checkpoint) === reference.checkpointDigest));
        const duplicate = cloneRecord(original);
        duplicate.lastAttemptAt = "2026-07-28T21:00:00.000Z";
        duplicate.lastSuccessfulPollAt = "2026-07-28T21:00:00.000Z";
        duplicate.watermark.observedThrough =
            "2026-07-28T21:00:00.000Z";
        duplicate.checkpointId = recomputeCheckpointId(duplicate);
        const duplicateDigest = (0, source_contracts_js_1.taskMapContractDigest)(duplicate);
        const forged = resealCheckpointArtifact(fixture.prepared, (artifact) => {
            artifact.checkpoints.push({
                checkpointDigest: duplicateDigest,
                bindingDigest: (0, source_contracts_js_1.taskMapContractDigest)(duplicate.binding),
                checkpoint: duplicate,
            });
            artifact.laneReferences.push({
                ...reference,
                checkpointDigest: duplicateDigest,
            });
        });
        await withRunRoot(async (runRoot) => {
            await expectBundleError((0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, forged), ["invalid_contract"]);
        });
    });
    (0, node_test_1.it)("rejects a resealed checkpoint that contradicts lane error audit facts", async () => {
        const fixture = terminalAttemptFixture("failed");
        const checkpointArtifact = JSON.parse(fixture.prepared.members["checkpoints.json"]);
        const attemptReference = checkpointArtifact.laneReferences.find((reference) => reference.referenceKind === "attempt_output");
        const originalRecord = checkpointArtifact.checkpoints.find((record) => (record.checkpointDigest === attemptReference.checkpointDigest));
        const contradictory = cloneRecord(originalRecord.checkpoint);
        contradictory.error.code = "synthetic_contradictory_failure";
        contradictory.error.detailDigest =
            digest("synthetic-contradictory-failure");
        contradictory.checkpointId = recomputeCheckpointId(contradictory);
        node_assert_1.default.deepStrictEqual((0, source_contracts_js_1.assertTaskMapConnectorCheckpoint)(contradictory), contradictory);
        const contradictoryDigest = (0, source_contracts_js_1.taskMapContractDigest)(contradictory);
        const forged = resealCheckpointArtifact(fixture.prepared, (artifact) => {
            const record = artifact.checkpoints.find((candidate) => (candidate.checkpointDigest === originalRecord.checkpointDigest));
            record.checkpoint = contradictory;
            record.checkpointDigest = contradictoryDigest;
            for (const reference of artifact.laneReferences) {
                if (reference.checkpointDigest
                    === originalRecord.checkpointDigest) {
                    reference.checkpointDigest = contradictoryDigest;
                }
            }
        });
        await withRunRoot(async (runRoot) => {
            await expectBundleError((0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, forged), ["invalid_contract"]);
        });
    });
    (0, node_test_1.it)("rejects a fully resealed on-disk checkpoint secret", async () => {
        const fixture = terminalAttemptFixture("failed");
        const checkpointArtifact = JSON.parse(fixture.prepared.members["checkpoints.json"]);
        const attemptReference = checkpointArtifact.laneReferences.find((reference) => reference.referenceKind === "attempt_output");
        const originalRecord = checkpointArtifact.checkpoints.find((record) => (record.checkpointDigest === attemptReference.checkpointDigest));
        const secretCheckpoint = cloneRecord(originalRecord.checkpoint);
        secretCheckpoint.error.code =
            "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        secretCheckpoint.checkpointId =
            recomputeCheckpointId(secretCheckpoint);
        const secretDigest = (0, source_contracts_js_1.taskMapContractDigest)(secretCheckpoint);
        const forged = resealCheckpointArtifact(fixture.prepared, (artifact) => {
            const record = artifact.checkpoints.find((candidate) => (candidate.checkpointDigest === originalRecord.checkpointDigest));
            record.checkpoint = secretCheckpoint;
            record.checkpointDigest = secretDigest;
            for (const reference of artifact.laneReferences) {
                if (reference.checkpointDigest
                    === originalRecord.checkpointDigest) {
                    reference.checkpointDigest = secretDigest;
                }
            }
        });
        await withRunRoot(async (runRoot) => {
            const target = node_path_1.default.join(runRoot, forged.bundleId);
            await (0, promises_1.mkdir)(target, { mode: DIRECTORY_MODE });
            await (0, promises_1.chmod)(target, DIRECTORY_MODE);
            for (const [fileName, bytes] of Object.entries(forged.members)) {
                await (0, promises_1.writeFile)(node_path_1.default.join(target, fileName), bytes, {
                    mode: FILE_MODE,
                });
                await (0, promises_1.chmod)(node_path_1.default.join(target, fileName), FILE_MODE);
            }
            for (const [fileName, bytes] of [
                [
                    "manifest.json",
                    (0, source_contracts_js_1.taskMapContractCanonicalJson)(forged.manifest),
                ],
                [
                    "COMMITTED",
                    (0, source_contracts_js_1.taskMapContractCanonicalJson)(forged.commitMarker),
                ],
            ]) {
                await (0, promises_1.writeFile)(node_path_1.default.join(target, fileName), bytes, {
                    mode: FILE_MODE,
                });
                await (0, promises_1.chmod)(node_path_1.default.join(target, fileName), FILE_MODE);
            }
            await node_assert_1.default.rejects(() => (0, refresh_run_bundle_js_1.verifyTaskMapRefreshRunBundle)(target), /known sensitive string form/i);
        });
    });
    (0, node_test_1.it)("fails closed on every pre-existing target kind without clobbering", async () => {
        await withRunRoot(async (runRoot) => {
            const fixture = syntheticFixture();
            const target = node_path_1.default.join(runRoot, fixture.prepared.bundleId);
            await (0, promises_1.mkdir)(target, { mode: DIRECTORY_MODE });
            const error = await expectBundleError((0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, fixture.prepared, { reservationWaitMs: 0 }), ["reservation_incomplete", "unsafe_target"]);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(target), []);
            node_assert_1.default.ok(error.code !== "reservation_incomplete" || error.sameUidResidual);
        });
        await withRunRoot(async (runRoot) => {
            const fixture = syntheticFixture();
            const outside = await (0, promises_1.mkdtemp)(node_path_1.default.join(await (0, promises_1.realpath)((0, node_os_1.tmpdir)()), "taskmap-refresh-run-outside-"));
            await (0, promises_1.chmod)(outside, DIRECTORY_MODE);
            try {
                const target = node_path_1.default.join(runRoot, fixture.prepared.bundleId);
                await (0, promises_1.symlink)(outside, target);
                await expectBundleError((0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, fixture.prepared, { reservationWaitMs: 0 }), ["unsafe_target"]);
                node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(outside), []);
            }
            finally {
                await (0, promises_1.rm)(outside, { recursive: true, force: true });
            }
        });
        await withRunRoot(async (runRoot) => {
            const fixture = syntheticFixture();
            const target = node_path_1.default.join(runRoot, fixture.prepared.bundleId);
            await (0, promises_1.writeFile)(target, "regular-target-sentinel", {
                mode: FILE_MODE,
            });
            await (0, promises_1.chmod)(target, FILE_MODE);
            await expectBundleError((0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, fixture.prepared, { reservationWaitMs: 0 }), ["unsafe_target"]);
            node_assert_1.default.strictEqual(await (0, promises_1.readFile)(target, "utf8"), "regular-target-sentinel");
        });
        await withRunRoot(async (runRoot) => {
            const fixture = syntheticFixture();
            const target = node_path_1.default.join(runRoot, fixture.prepared.bundleId);
            await (0, promises_1.mkdir)(target, { mode: DIRECTORY_MODE });
            await (0, promises_1.chmod)(target, DIRECTORY_MODE);
            const sentinel = node_path_1.default.join(target, "nonempty-target-sentinel");
            await (0, promises_1.writeFile)(sentinel, "preserve-me", { mode: FILE_MODE });
            await (0, promises_1.chmod)(sentinel, FILE_MODE);
            await expectBundleError((0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, fixture.prepared, { reservationWaitMs: 0 }), ["unsafe_target"]);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(target), ["nonempty-target-sentinel"]);
            node_assert_1.default.strictEqual(await (0, promises_1.readFile)(sentinel, "utf8"), "preserve-me");
        });
    });
    (0, node_test_1.it)("rejects member symlinks, hardlinks, FIFOs, and Unix sockets", async () => {
        await withRunRoot(async (runRoot) => {
            const { bundleDirectory } = await materialized(runRoot);
            const planPath = node_path_1.default.join(bundleDirectory, "plan.json");
            const outside = node_path_1.default.join(runRoot, "outside.json");
            await (0, promises_1.writeFile)(outside, "{}", { mode: FILE_MODE });
            await (0, promises_1.unlink)(planPath);
            await (0, promises_1.symlink)(outside, planPath);
            await expectBundleError((0, refresh_run_bundle_js_1.verifyTaskMapRefreshRunBundle)(bundleDirectory), ["unsafe_target"]);
        });
        await withRunRoot(async (runRoot) => {
            const { bundleDirectory } = await materialized(runRoot);
            const planPath = node_path_1.default.join(bundleDirectory, "plan.json");
            const batchPath = node_path_1.default.join(bundleDirectory, "batch.json");
            await (0, promises_1.unlink)(batchPath);
            await (0, promises_1.link)(planPath, batchPath);
            node_assert_1.default.ok((await (0, promises_1.lstat)(planPath)).nlink > 1);
            await expectBundleError((0, refresh_run_bundle_js_1.verifyTaskMapRefreshRunBundle)(bundleDirectory), ["unsafe_target"]);
        });
        await withRunRoot(async (runRoot) => {
            const { bundleDirectory } = await materialized(runRoot);
            const planPath = node_path_1.default.join(bundleDirectory, "plan.json");
            await (0, promises_1.unlink)(planPath);
            const made = (0, node_child_process_1.spawnSync)("mkfifo", [planPath], { encoding: "utf8" });
            node_assert_1.default.strictEqual(made.status, 0, made.stderr);
            await expectBundleError((0, refresh_run_bundle_js_1.verifyTaskMapRefreshRunBundle)(bundleDirectory), ["unsafe_target"]);
        });
        await withRunRoot(async (runRoot) => {
            const { bundleDirectory } = await materialized(runRoot);
            const planPath = node_path_1.default.join(bundleDirectory, "plan.json");
            await (0, promises_1.unlink)(planPath);
            const socketPath = node_path_1.default.join(runRoot, "bundle.sock");
            const server = (0, node_net_1.createServer)();
            try {
                await new Promise((resolve, reject) => {
                    server.once("error", reject);
                    server.listen(socketPath, resolve);
                });
                await (0, promises_1.rename)(socketPath, planPath);
                node_assert_1.default.ok((await (0, promises_1.lstat)(planPath)).isSocket());
                await expectBundleError((0, refresh_run_bundle_js_1.verifyTaskMapRefreshRunBundle)(bundleDirectory), ["unsafe_target"]);
            }
            finally {
                await new Promise((resolve) => server.close(() => resolve()));
            }
        });
    });
    (0, node_test_1.it)("rejects file, directory, and run-root permission drift", async () => {
        await withRunRoot(async (runRoot) => {
            const { bundleDirectory } = await materialized(runRoot);
            await (0, promises_1.chmod)(node_path_1.default.join(bundleDirectory, "plan.json"), 0o640);
            await expectBundleError((0, refresh_run_bundle_js_1.verifyTaskMapRefreshRunBundle)(bundleDirectory), ["unsafe_target"]);
        });
        await withRunRoot(async (runRoot) => {
            const { bundleDirectory } = await materialized(runRoot);
            await (0, promises_1.chmod)(bundleDirectory, 0o750);
            await expectBundleError((0, refresh_run_bundle_js_1.verifyTaskMapRefreshRunBundle)(bundleDirectory), ["unsafe_target"]);
        });
        await withRunRoot(async (runRoot) => {
            const fixture = syntheticFixture();
            await (0, promises_1.chmod)(runRoot, 0o750);
            await expectBundleError((0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, fixture.prepared), ["invalid_root"]);
        });
        await withRunRoot(async (runRoot) => {
            const { bundleDirectory } = await materialized(runRoot);
            const planPath = node_path_1.default.join(bundleDirectory, "plan.json");
            await (0, promises_1.chmod)(planPath, 0o4600);
            if (((await (0, promises_1.lstat)(planPath)).mode & 0o7000) !== 0) {
                await expectBundleError((0, refresh_run_bundle_js_1.verifyTaskMapRefreshRunBundle)(bundleDirectory), ["unsafe_target"]);
            }
        });
        await withRunRoot(async (runRoot) => {
            const { bundleDirectory } = await materialized(runRoot);
            await (0, promises_1.chmod)(bundleDirectory, 0o1700);
            if (((await (0, promises_1.lstat)(bundleDirectory)).mode & 0o7000) !== 0) {
                await expectBundleError((0, refresh_run_bundle_js_1.verifyTaskMapRefreshRunBundle)(bundleDirectory), ["unsafe_target"]);
            }
        });
    });
    (0, node_test_1.it)("rejects invalid UTF-8 before canonical or digest re-encoding", async () => {
        await withRunRoot(async (runRoot) => {
            const { bundleDirectory } = await materialized(runRoot);
            const planPath = node_path_1.default.join(bundleDirectory, "plan.json");
            const bytes = await (0, promises_1.readFile)(planPath);
            bytes[0] = 0xff;
            await (0, promises_1.writeFile)(planPath, bytes);
            await (0, promises_1.chmod)(planPath, FILE_MODE);
            await expectBundleError((0, refresh_run_bundle_js_1.verifyTaskMapRefreshRunBundle)(bundleDirectory), ["bundle_corrupt"]);
        });
    });
    (0, node_test_1.it)("rejects canonical disk JSON beyond the nesting bound before re-canonicalization", async () => {
        await withRunRoot(async (runRoot) => {
            const { bundleDirectory } = await materialized(runRoot);
            const planPath = node_path_1.default.join(bundleDirectory, "plan.json");
            let nested = {};
            for (let depth = 0; depth
                <= refresh_run_bundle_js_1.TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxJsonDepth + 1; depth += 1) {
                nested = { nested };
            }
            await (0, promises_1.writeFile)(planPath, (0, source_contracts_js_1.taskMapContractCanonicalJson)(nested));
            await expectBundleError((0, refresh_run_bundle_js_1.verifyTaskMapRefreshRunBundle)(bundleDirectory), ["invalid_contract"]);
        });
    });
    (0, node_test_1.it)("rejects traversal aliases and a prepared-object collision", async () => {
        await withRunRoot(async (runRoot) => {
            const fixture = syntheticFixture();
            const aliasRoot = `${runRoot}-alias`;
            await (0, promises_1.symlink)(runRoot, aliasRoot);
            try {
                await expectBundleError((0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(aliasRoot, fixture.prepared), ["invalid_root", "unsafe_target"]);
            }
            finally {
                await (0, promises_1.unlink)(aliasRoot);
            }
        });
        await withRunRoot(async (runRoot) => {
            const fixture = syntheticFixture();
            const forged = cloneRecord(fixture.prepared);
            forged.bundleId =
                `tmrefreshrun_${digest("prepared-collision")}`;
            await expectBundleError((0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, forged), ["invalid_contract"]);
        });
    });
});
