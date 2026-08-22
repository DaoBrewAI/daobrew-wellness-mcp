"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = __importDefault(require("node:assert"));
const node_child_process_1 = require("node:child_process");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const refresh_plan_js_1 = require("../src/engine/taskmap/refresh-plan.js");
const refresh_run_bundle_js_1 = require("../src/engine/taskmap/refresh-run-bundle.js");
const refreshRunBundleRuntime = __importStar(require("../src/engine/taskmap/refresh-run-bundle.js"));
const refresh_current_ref_js_1 = require("../src/engine/taskmap/refresh-current-ref.js");
const DIRECTORY_MODE = 0o700;
const ZERO_GENERATION = "00000000000000000000";
const FIRST_GENERATION = "00000000000000000001";
const SECOND_GENERATION = "00000000000000000002";
const THIRD_GENERATION = "00000000000000000003";
const FOURTH_GENERATION = "00000000000000000004";
const digest = (label) => (0, source_contracts_js_1.taskMapContractDigest)(`refresh-current-ref-test:${label}`);
const OWNER_SCOPE_DIGEST = digest("owner");
const BINDING = {
    connectionId: "synthetic-current-ref-connection",
    sourceKind: "strategy",
    tenantOrWorkspaceDigest: digest("workspace"),
    accountOrPrincipalDigest: digest("principal"),
    grantVersion: "synthetic-read-v1",
};
const SECOND_BINDING = {
    connectionId: "synthetic-current-ref-slack-connection",
    sourceKind: "slack",
    tenantOrWorkspaceDigest: digest("slack-workspace"),
    accountOrPrincipalDigest: digest("slack-principal"),
    grantVersion: "synthetic-read-v1",
};
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
function lane(value) {
    return {
        contractVersion: refresh_plan_js_1.TASKMAP_REFRESH_LANE_VERSION,
        ...value,
    };
}
function sourceSnapshot(revisionLabel) {
    const envelope = (0, source_contracts_js_1.buildTaskMapSourceEnvelope)({
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
    return (0, source_contracts_js_1.buildTaskMapSourceSnapshot)([envelope], []);
}
function sourceRevisionSetDigest(revisions) {
    return (0, source_contracts_js_1.taskMapContractDigest)(revisions.map((revision) => ({
        sourceIdentityDigest: revision.sourceIdentityDigest,
        sourceRevisionDigest: revision.sourceRevisionDigest,
        contentDigest: revision.contentDigest,
    })));
}
function lanes(bindingDigest, checkpointDigest, sourceSliceDigest) {
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
    const bindingDigest = (0, source_contracts_js_1.taskMapContractDigest)(BINDING);
    const checkpoint = (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(null, {
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
        sourceRevisionDigest: (0, source_contracts_js_1.taskMapContractDigest)(envelope.sourceRevision),
        contentDigest: envelope.contentDigest,
    }));
    const draft = {
        contractVersion: refresh_plan_js_1.TASKMAP_REFRESH_PLAN_DRAFT_VERSION,
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
            reviewAttestationVersion: refresh_plan_js_1.TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION,
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
    const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft);
    const laneStates = plan.lanes.map((plannedLane) => ({
        laneId: plannedLane.laneId,
        status: "succeeded",
    }));
    const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
        maxConcurrency: 2,
        laneStates,
    });
    node_assert_1.default.strictEqual(batch.publication.state, "complete");
    const sourceSlice = (0, refresh_run_bundle_js_1.buildTaskMapRefreshRunSourceSliceProof)({
        ownerScopeDigest: OWNER_SCOPE_DIGEST,
        bindingDigest,
        sourceRevisions,
        acceptedSourceIdentityDigests: checkpoint.acceptedSourceIdentityDigests,
    });
    const prepared = (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)({
        plan,
        batch,
        connectorCheckpoints: [checkpoint],
        attemptOutputs: [{
                laneId: "collect",
                checkpointDigest: (0, source_contracts_js_1.taskMapContractDigest)(checkpoint),
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
    const bindingDigest = (0, source_contracts_js_1.taskMapContractDigest)(BINDING);
    const checkpoint = (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(null, {
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
        sourceRevisionDigest: (0, source_contracts_js_1.taskMapContractDigest)(envelope.sourceRevision),
        contentDigest: envelope.contentDigest,
    }));
    const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)({
        contractVersion: refresh_plan_js_1.TASKMAP_REFRESH_PLAN_DRAFT_VERSION,
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
            reviewAttestationVersion: refresh_plan_js_1.TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION,
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
    const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
        maxConcurrency: 2,
        laneStates: plan.lanes.map((plannedLane) => (plannedLane.laneId === "collect"
            ? {
                laneId: plannedLane.laneId,
                status: "failed",
                errorCode: "provider_unavailable",
                errorDetailDigest: digest("blocked-genesis-error"),
            }
            : {
                laneId: plannedLane.laneId,
                status: "pending",
            })),
    });
    node_assert_1.default.strictEqual(batch.publication.state, "blocked");
    const sourceSlice = (0, refresh_run_bundle_js_1.buildTaskMapRefreshRunSourceSliceProof)({
        sliceRole: "observed_non_serving",
        ownerScopeDigest: OWNER_SCOPE_DIGEST,
        bindingDigest,
        sourceRevisions: [],
        acceptedSourceIdentityDigests: [],
    });
    const prepared = (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)({
        plan,
        batch,
        connectorCheckpoints: [checkpoint],
        attemptOutputs: [{
                laneId: "collect",
                checkpointDigest: (0, source_contracts_js_1.taskMapContractDigest)(checkpoint),
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
function adapterUpgradeFixture(prior, mutateBaseline) {
    const snapshot = sourceSnapshot("adapter-v2");
    const bindingDigest = (0, source_contracts_js_1.taskMapContractDigest)(BINDING);
    const checkpoint = (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(null, {
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
        sourceRevisionDigest: (0, source_contracts_js_1.taskMapContractDigest)(envelope.sourceRevision),
        contentDigest: envelope.contentDigest,
    }));
    const priorCheckpointDigest = (0, source_contracts_js_1.taskMapContractDigest)(prior.checkpoint);
    const draft = {
        contractVersion: refresh_plan_js_1.TASKMAP_REFRESH_PLAN_DRAFT_VERSION,
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
            priorSemanticImplementationDigest: prior.plan.semanticImplementationDigest,
            acceptedSourceRevisions: prior.plan.sourceRevisions,
            acceptedSourceRevisionSets: prior.plan.sourceRevisionSets,
            acceptedSemanticInputDigests: prior.plan.semanticInputDigests,
            acceptedDeterministicReplayDigest: prior.plan.deterministicReplayDigest,
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
        lanes: lanes(bindingDigest, priorCheckpointDigest, prior.sourceSlice.sourceSliceDigest),
    };
    mutateBaseline?.(draft.baseline);
    const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft);
    const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
        maxConcurrency: 2,
        laneStates: plan.lanes.map((plannedLane) => ({
            laneId: plannedLane.laneId,
            status: "succeeded",
        })),
    });
    node_assert_1.default.strictEqual(batch.publication.state, "complete");
    const sourceSlice = (0, refresh_run_bundle_js_1.buildTaskMapRefreshRunSourceSliceProof)({
        ownerScopeDigest: OWNER_SCOPE_DIGEST,
        bindingDigest,
        sourceRevisions,
        acceptedSourceIdentityDigests: checkpoint.acceptedSourceIdentityDigests,
    });
    const prepared = (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)({
        plan,
        batch,
        connectorCheckpoints: [checkpoint],
        attemptOutputs: [{
                laneId: "collect",
                checkpointDigest: (0, source_contracts_js_1.taskMapContractDigest)(checkpoint),
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
function blockedAdapterAttemptFixture(prior) {
    const snapshot = sourceSnapshot("blocked-adapter-v2");
    const bindingDigest = (0, source_contracts_js_1.taskMapContractDigest)(BINDING);
    const checkpoint = (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(prior.checkpoint, {
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
        sourceRevisionDigest: (0, source_contracts_js_1.taskMapContractDigest)(envelope.sourceRevision),
        contentDigest: envelope.contentDigest,
    }));
    const priorCheckpointDigest = (0, source_contracts_js_1.taskMapContractDigest)(prior.checkpoint);
    const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)({
        contractVersion: refresh_plan_js_1.TASKMAP_REFRESH_PLAN_DRAFT_VERSION,
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
            priorSemanticImplementationDigest: prior.plan.semanticImplementationDigest,
            acceptedSourceRevisions: prior.plan.sourceRevisions,
            acceptedSourceRevisionSets: prior.plan.sourceRevisionSets,
            acceptedSemanticInputDigests: prior.plan.semanticInputDigests,
            acceptedDeterministicReplayDigest: prior.plan.deterministicReplayDigest,
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
        lanes: lanes(bindingDigest, priorCheckpointDigest, prior.sourceSlice.sourceSliceDigest),
    });
    const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
        maxConcurrency: 2,
        laneStates: plan.lanes.map((plannedLane) => (plannedLane.laneId === "collect"
            ? {
                laneId: plannedLane.laneId,
                status: "failed",
                errorCode: "provider_unavailable",
                errorDetailDigest: digest("blocked-adapter-v2-error"),
                lastGoodCheckpointDigest: priorCheckpointDigest,
                lastGoodSourceSliceDigest: prior.sourceSlice.sourceSliceDigest,
            }
            : {
                laneId: plannedLane.laneId,
                status: "pending",
            })),
    });
    node_assert_1.default.strictEqual(batch.publication.state, "blocked");
    const sourceSlice = prior.sourceSlice;
    const prepared = (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)({
        plan,
        batch,
        connectorCheckpoints: [prior.checkpoint, checkpoint],
        attemptOutputs: [{
                laneId: "collect",
                checkpointDigest: (0, source_contracts_js_1.taskMapContractDigest)(checkpoint),
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
function splicedBlockedArtifactFixture(accepted, blocked) {
    const snapshot = sourceSnapshot("spliced-blocked-adapter");
    const bindingDigest = (0, source_contracts_js_1.taskMapContractDigest)(BINDING);
    const checkpoint = (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(blocked.checkpoint, {
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
    });
    const sourceRevisions = snapshot.envelopes.map((envelope) => ({
        bindingDigest,
        sourceIdentityDigest: envelope.sourceIdentityDigest,
        sourceRevisionDigest: (0, source_contracts_js_1.taskMapContractDigest)(envelope.sourceRevision),
        contentDigest: envelope.contentDigest,
    }));
    const blockedCheckpointDigest = (0, source_contracts_js_1.taskMapContractDigest)(blocked.checkpoint);
    const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)({
        contractVersion: refresh_plan_js_1.TASKMAP_REFRESH_PLAN_DRAFT_VERSION,
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
            priorAcceptedStateDigest: accepted.plan.candidateAcceptedStateDigest,
            priorOwnerScopeDigest: OWNER_SCOPE_DIGEST,
            priorSourceSnapshotDigest: accepted.snapshot.sourceSnapshotDigest,
            priorReviewedEvidenceDigest: accepted.plan.reviewedEvidenceDigest,
            priorPolicyBundleDigest: accepted.plan.policyBundleDigest,
            priorSemanticImplementationDigest: accepted.plan.semanticImplementationDigest,
            acceptedSourceRevisions: accepted.plan.sourceRevisions,
            acceptedSourceRevisionSets: accepted.plan.sourceRevisionSets,
            acceptedSemanticInputDigests: accepted.plan.semanticInputDigests,
            acceptedDeterministicReplayDigest: accepted.plan.deterministicReplayDigest,
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
        lanes: lanes(bindingDigest, blockedCheckpointDigest, blocked.sourceSlice.sourceSliceDigest),
    });
    const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
        maxConcurrency: 2,
        laneStates: plan.lanes.map((plannedLane) => ({
            laneId: plannedLane.laneId,
            status: "succeeded",
        })),
    });
    const sourceSlice = (0, refresh_run_bundle_js_1.buildTaskMapRefreshRunSourceSliceProof)({
        ownerScopeDigest: OWNER_SCOPE_DIGEST,
        bindingDigest,
        sourceRevisions,
        acceptedSourceIdentityDigests: checkpoint.acceptedSourceIdentityDigests,
    });
    const prepared = (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)({
        plan,
        batch,
        connectorCheckpoints: [checkpoint],
        attemptOutputs: [{
                laneId: "collect",
                checkpointDigest: (0, source_contracts_js_1.taskMapContractDigest)(checkpoint),
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
function semanticSourceSnapshot(facts) {
    return (0, source_contracts_js_1.buildTaskMapSourceSnapshot)(facts.map((fact) => (0, source_contracts_js_1.buildTaskMapSourceEnvelope)({
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
    })), []);
}
function semanticSuccessfulCheckpoint(previous, snapshot, binding, label, attemptedAt) {
    const bindingDigest = (0, source_contracts_js_1.taskMapContractDigest)(binding);
    const acceptedSourceIdentityDigests = snapshot.envelopes
        .filter((envelope) => ((0, source_contracts_js_1.taskMapContractDigest)(envelope.binding) === bindingDigest))
        .map((envelope) => envelope.sourceIdentityDigest);
    node_assert_1.default.ok(acceptedSourceIdentityDigests.length > 0);
    return (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(previous, {
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
function semanticFailedCheckpoint(previous, binding, label, attemptedAt) {
    return (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(previous, {
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
function semanticRevisionSets(revisions, bindingDigests) {
    return [...bindingDigests].sort().map((bindingDigest) => {
        const bindingRevisions = revisions
            .filter((revision) => revision.bindingDigest === bindingDigest)
            .sort((left, right) => (left.sourceIdentityDigest.localeCompare(right.sourceIdentityDigest)
            || left.sourceRevisionDigest.localeCompare(right.sourceRevisionDigest)
            || left.contentDigest.localeCompare(right.contentDigest)));
        return {
            bindingDigest,
            revisionSetDigest: sourceRevisionSetDigest(bindingRevisions),
        };
    });
}
function semanticPublicationFixture(input) {
    const sourceRevisions = input.snapshot.envelopes.map((envelope) => ({
        bindingDigest: (0, source_contracts_js_1.taskMapContractDigest)(envelope.binding),
        sourceIdentityDigest: envelope.sourceIdentityDigest,
        sourceRevisionDigest: (0, source_contracts_js_1.taskMapContractDigest)(envelope.sourceRevision),
        contentDigest: envelope.contentDigest,
    })).sort((left, right) => (left.bindingDigest.localeCompare(right.bindingDigest)
        || left.sourceIdentityDigest.localeCompare(right.sourceIdentityDigest)
        || left.sourceRevisionDigest.localeCompare(right.sourceRevisionDigest)
        || left.contentDigest.localeCompare(right.contentDigest)));
    const providers = [...input.attemptCheckpoints].map((checkpoint) => {
        const bindingDigest = (0, source_contracts_js_1.taskMapContractDigest)(checkpoint.binding);
        const envelope = input.snapshot.envelopes.find((candidate) => ((0, source_contracts_js_1.taskMapContractDigest)(candidate.binding) === bindingDigest));
        node_assert_1.default.ok(envelope);
        const acceptedCheckpoint = input.acceptedOrigin?.attemptCheckpoints.find((candidate) => ((0, source_contracts_js_1.taskMapContractDigest)(candidate.binding) === bindingDigest));
        const acceptedSourceSlice = input.acceptedOrigin?.sourceSliceByBinding.get(bindingDigest);
        if (input.acceptedOrigin !== undefined) {
            node_assert_1.default.ok(acceptedCheckpoint);
            node_assert_1.default.ok(acceptedSourceSlice);
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
                    checkpointDigest: (0, source_contracts_js_1.taskMapContractDigest)(acceptedCheckpoint),
                    sourceSliceDigest: acceptedSourceSlice.sourceSliceDigest,
                },
        };
    }).sort((left, right) => (left.bindingDigest.localeCompare(right.bindingDigest)));
    node_assert_1.default.strictEqual(new Set(providers.map((provider) => provider.bindingDigest)).size, providers.length);
    const bindingDigests = providers.map((provider) => provider.bindingDigest);
    const priorProviderArtifacts = providers.flatMap((provider) => (provider.acceptedArtifact === undefined
        ? []
        : [provider.acceptedArtifact]));
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
            reviewAttestationVersion: refresh_plan_js_1.TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION,
            reviewAttestationDigest: digest("semantic-review-attestation"),
            sourceManifestDigest: digest("semantic-source-manifest"),
        };
    const draft = {
        contractVersion: refresh_plan_js_1.TASKMAP_REFRESH_PLAN_DRAFT_VERSION,
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
                priorAcceptedStateDigest: input.acceptedOrigin.plan.candidateAcceptedStateDigest,
                priorOwnerScopeDigest: OWNER_SCOPE_DIGEST,
                priorSourceSnapshotDigest: input.acceptedOrigin.snapshot.sourceSnapshotDigest,
                priorReviewedEvidenceDigest: input.acceptedOrigin.plan.reviewedEvidenceDigest,
                priorPolicyBundleDigest: input.acceptedOrigin.plan.policyBundleDigest,
                priorSemanticImplementationDigest: input.acceptedOrigin.plan.semanticImplementationDigest,
                acceptedSourceRevisions: input.acceptedOrigin.plan.sourceRevisions,
                acceptedSourceRevisionSets: input.acceptedOrigin.plan.sourceRevisionSets,
                acceptedSemanticInputDigests: input.acceptedOrigin.plan.semanticInputDigests,
                acceptedDeterministicReplayDigest: input.acceptedOrigin.plan.deterministicReplayDigest,
            },
        reviewedDigests,
        sourceBindings: providers.map((provider) => ({
            bindingDigest: provider.bindingDigest,
            sourceKind: provider.sourceKind,
            sourceContractVersion: provider.sourceContractVersion,
            adapterVersion: provider.adapterVersion,
        })),
        sourceRevisions,
        sourceRevisionSets: semanticRevisionSets(sourceRevisions, bindingDigests),
        semanticInputDigests: [input.snapshot.semanticInputDigest],
        deterministicReplayDigest: digest(`semantic-replay-${input.label}`),
        policyBindings: policy,
        lanes: [
            ...providerLanes,
            lane({
                laneId: "semantic-identity",
                goal: "identity_dedupe_barrier",
                operationVersion: "semantic-identity.1",
                priority: "P0",
                priorityReasonCodes: ["identity_integrity"],
                predecessorLaneIds: providers.map((provider) => provider.normalizeLaneId),
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
    const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft);
    const laneStates = plan.lanes.map((plannedLane) => {
        if (input.publicationState === "complete") {
            return { laneId: plannedLane.laneId, status: "succeeded" };
        }
        const collectProvider = providers.find((provider) => provider.collectLaneId === plannedLane.laneId);
        if (collectProvider !== undefined) {
            if (collectProvider.checkpoint.state === "success") {
                return { laneId: plannedLane.laneId, status: "succeeded" };
            }
            node_assert_1.default.ok(collectProvider.acceptedArtifact);
            return {
                laneId: plannedLane.laneId,
                status: "failed",
                errorCode: "provider_unavailable",
                errorDetailDigest: collectProvider.checkpoint.error.detailDigest,
                lastGoodCheckpointDigest: collectProvider.acceptedArtifact.checkpointDigest,
                lastGoodSourceSliceDigest: collectProvider.acceptedArtifact.sourceSliceDigest,
            };
        }
        const normalizedProvider = providers.find((provider) => provider.normalizeLaneId === plannedLane.laneId);
        if (normalizedProvider?.checkpoint.state === "success") {
            return { laneId: plannedLane.laneId, status: "succeeded" };
        }
        return { laneId: plannedLane.laneId, status: "pending" };
    });
    const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
        maxConcurrency: providers.length,
        laneStates,
    });
    node_assert_1.default.strictEqual(batch.publication.state, input.publicationState);
    const sourceSliceByBinding = new Map();
    for (const provider of providers) {
        if (provider.checkpoint.state === "success") {
            sourceSliceByBinding.set(provider.bindingDigest, (0, refresh_run_bundle_js_1.buildTaskMapRefreshRunSourceSliceProof)({
                ownerScopeDigest: OWNER_SCOPE_DIGEST,
                bindingDigest: provider.bindingDigest,
                sourceRevisions: plan.sourceRevisions.filter((revision) => (revision.bindingDigest === provider.bindingDigest)),
                acceptedSourceIdentityDigests: provider.checkpoint.acceptedSourceIdentityDigests,
            }));
            continue;
        }
        const retained = input.acceptedOrigin?.sourceSliceByBinding.get(provider.bindingDigest);
        node_assert_1.default.ok(retained);
        sourceSliceByBinding.set(provider.bindingDigest, retained);
    }
    const attemptOutputs = providers.map((provider) => ({
        laneId: provider.collectLaneId,
        checkpointDigest: (0, source_contracts_js_1.taskMapContractDigest)(provider.checkpoint),
        sourceSliceDigest: sourceSliceByBinding.get(provider.bindingDigest).sourceSliceDigest,
    }));
    const connectorCheckpoints = [...input.attemptCheckpoints];
    for (const provider of providers) {
        if (provider.checkpoint.state === "success")
            continue;
        const acceptedCheckpoint = input.acceptedOrigin?.attemptCheckpoints.find((candidate) => ((0, source_contracts_js_1.taskMapContractDigest)(candidate.binding)
            === provider.bindingDigest));
        node_assert_1.default.ok(acceptedCheckpoint);
        connectorCheckpoints.push(acceptedCheckpoint);
    }
    const checkpointByDigest = new Map(connectorCheckpoints.map((checkpoint) => [(0, source_contracts_js_1.taskMapContractDigest)(checkpoint), checkpoint]));
    const sourceSliceByDigest = new Map([...sourceSliceByBinding.values()].map((proof) => [
        proof.sourceSliceDigest,
        proof,
    ]));
    const prepared = (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)({
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
async function expectCurrentError(action, code) {
    let caught;
    try {
        await action;
    }
    catch (error) {
        caught = error;
    }
    node_assert_1.default.ok(caught instanceof refresh_current_ref_js_1.TaskMapRefreshCurrentError);
    node_assert_1.default.strictEqual(caught.code, code);
    return caught;
}
async function withStores(callback) {
    const canonicalTmp = await (0, promises_1.realpath)((0, node_os_1.tmpdir)());
    const parent = await (0, promises_1.mkdtemp)(node_path_1.default.join(canonicalTmp, "taskmap-current-ref-test-"));
    await (0, promises_1.chmod)(parent, DIRECTORY_MODE);
    const runRoot = node_path_1.default.join(parent, "runs");
    const currentRoot = node_path_1.default.join(parent, "current");
    await (0, promises_1.mkdir)(runRoot, { mode: DIRECTORY_MODE });
    await (0, promises_1.mkdir)(currentRoot, { mode: DIRECTORY_MODE });
    await (0, promises_1.chmod)(runRoot, DIRECTORY_MODE);
    await (0, promises_1.chmod)(currentRoot, DIRECTORY_MODE);
    try {
        await (0, refresh_current_ref_js_1.initializeTaskMapRefreshCurrentStore)(currentRoot);
        return await callback({ parent, runRoot, currentRoot });
    }
    finally {
        await (0, promises_1.rm)(parent, { recursive: true, force: true });
    }
}
async function materializeFixture(runRoot, fixture) {
    const result = await (0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, fixture.prepared);
    node_assert_1.default.strictEqual(result.status, "created");
}
const PRIMARY_OPERATION_TOKEN = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const RETRY_OPERATION_TOKEN = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
async function runSigkillFaultChild(input) {
    const implementationPath = node_path_1.default.join(__dirname, "../src/engine/taskmap/refresh-current-ref.js");
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
    const child = (0, node_child_process_1.spawn)(process.execPath, [
        "-e",
        childProgram,
        implementationPath,
        input.currentRoot,
        input.runRoot,
        input.bundleId,
        input.operationToken,
        input.faultPoint,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
        stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
        stderr += chunk;
    });
    return new Promise((resolve, reject) => {
        let timedOut = false;
        const timeout = setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
            reject(new Error(`fault child timed out at ${input.faultPoint}`));
        }, 10_000);
        child.once("error", (error) => {
            clearTimeout(timeout);
            reject(error);
        });
        child.once("close", (code, signal) => {
            clearTimeout(timeout);
            if (timedOut)
                return;
            resolve({ code, signal, stdout, stderr });
        });
    });
}
function assertSigkilled(result) {
    node_assert_1.default.strictEqual(result.code, null, `child exited instead of SIGKILL\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
    node_assert_1.default.strictEqual(result.signal, "SIGKILL", `unexpected child signal\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
}
async function createUnknownObjectSentinel(currentRoot, label) {
    const sentinelPath = node_path_1.default.join(currentRoot, "objects", `unrelated-${label}.bin`);
    const bytes = Buffer.from(`unrelated-object:${label}`, "utf8");
    await (0, promises_1.writeFile)(sentinelPath, bytes, { mode: 0o600 });
    return {
        path: sentinelPath,
        bytes,
        stats: await (0, promises_1.lstat)(sentinelPath, { bigint: true }),
    };
}
async function assertUnknownObjectPreserved(sentinel) {
    const after = await (0, promises_1.lstat)(sentinel.path, { bigint: true });
    node_assert_1.default.strictEqual(after.dev, sentinel.stats.dev);
    node_assert_1.default.strictEqual(after.ino, sentinel.stats.ino);
    node_assert_1.default.strictEqual(after.nlink, sentinel.stats.nlink);
    node_assert_1.default.deepStrictEqual(await (0, promises_1.readFile)(sentinel.path), sentinel.bytes);
}
async function reservationEntries(currentRoot) {
    return (await (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "reservations"))).sort();
}
async function readReservationClaim(currentRoot, generation = FIRST_GENERATION) {
    return JSON.parse(await (0, promises_1.readlink)(node_path_1.default.join(currentRoot, "reservations", `${generation}.claim`)));
}
async function claimedObjectNames(currentRoot) {
    const claims = (await reservationEntries(currentRoot)).filter((name) => name.endsWith(".claim"));
    const claimed = new Set(await Promise.all(claims.map(async (name) => {
        const claim = JSON.parse(await (0, promises_1.readlink)(node_path_1.default.join(currentRoot, "reservations", name)));
        return claim.objectName;
    })));
    return (await (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "objects"))).filter((name) => claimed.has(name)).sort();
}
function syntheticRollbackRef(previous, target, generationNumber) {
    node_assert_1.default.ok(previous.attempt);
    node_assert_1.default.ok(target.accepted);
    const generation = generationNumber.toString().padStart(20, "0");
    const core = {
        contractVersion: refresh_current_ref_js_1.TASKMAP_REFRESH_CURRENT_REF_VERSION,
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
    return (0, refresh_current_ref_js_1.assertTaskMapRefreshCurrentRef)({
        ...core,
        refId: `tmrefreshcurrent_${(0, source_contracts_js_1.taskMapContractDigest)(core)}`,
    });
}
async function seedSyntheticRollbackRef(currentRoot, ref) {
    node_assert_1.default.ok(ref.rollback);
    const operationToken = digest(`seeded-rollback-${ref.generation}`).slice(0, 32);
    const objectName = `${ref.refId}.${operationToken}.json`;
    const objectPath = node_path_1.default.join(currentRoot, "objects", objectName);
    await (0, promises_1.writeFile)(objectPath, (0, source_contracts_js_1.taskMapContractCanonicalJson)(ref), { mode: 0o600 });
    const stats = await (0, promises_1.lstat)(objectPath, { bigint: true });
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
        (0, promises_1.symlink)((0, source_contracts_js_1.taskMapContractCanonicalJson)(reservation), node_path_1.default.join(currentRoot, "reservations", `${ref.generation}.claim`)),
        (0, promises_1.symlink)((0, source_contracts_js_1.taskMapContractCanonicalJson)(identity), node_path_1.default.join(currentRoot, "reservations", `${ref.generation}.identity`)),
    ]);
    await (0, promises_1.link)(objectPath, node_path_1.default.join(currentRoot, "generations", `${ref.generation}.ref`));
}
(0, node_test_1.describe)("P10.1C append-only current publication", () => {
    (0, node_test_1.it)("publishes genesis by one hardlink CAS and retries exactly", async () => {
        await withStores(async ({ runRoot, currentRoot }) => {
            const fixture = genesisCompleteFixture();
            await materializeFixture(runRoot, fixture);
            const first = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: fixture.prepared.bundleId,
                expectedGeneration: ZERO_GENERATION,
                options: {
                    operationToken: "11111111111111111111111111111111",
                },
            });
            node_assert_1.default.strictEqual(first.status, "published");
            node_assert_1.default.strictEqual(first.ref.generation, FIRST_GENERATION);
            node_assert_1.default.strictEqual(first.ref.operation, "complete");
            node_assert_1.default.strictEqual(first.ref.accepted?.acceptedStateDigest, fixture.plan.candidateAcceptedStateDigest);
            node_assert_1.default.strictEqual(first.ref.connectorHeads.length, 1);
            const snapshot = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
            node_assert_1.default.strictEqual(snapshot.status, "healthy");
            node_assert_1.default.strictEqual(snapshot.generations.length, 1);
            node_assert_1.default.strictEqual(snapshot.head?.refId, first.ref.refId);
            const claim = await readReservationClaim(currentRoot);
            const objectPath = node_path_1.default.join(currentRoot, "objects", claim.objectName);
            const generationPath = node_path_1.default.join(currentRoot, "generations", `${FIRST_GENERATION}.ref`);
            const [objectStats, generationStats] = await Promise.all([
                (0, promises_1.lstat)(objectPath),
                (0, promises_1.lstat)(generationPath),
            ]);
            node_assert_1.default.strictEqual(objectStats.dev, generationStats.dev);
            node_assert_1.default.strictEqual(objectStats.ino, generationStats.ino);
            node_assert_1.default.strictEqual(objectStats.nlink, 2);
            const retry = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: fixture.prepared.bundleId,
                expectedGeneration: ZERO_GENERATION,
            });
            node_assert_1.default.strictEqual(retry.status, "already_current");
            node_assert_1.default.strictEqual(retry.ref.refId, first.ref.refId);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "generations")), [`${FIRST_GENERATION}.ref`]);
        });
    });
    (0, node_test_1.it)("degrades when a durable claim origin is resealed to another valid bundle", async () => {
        await withStores(async ({ runRoot, currentRoot }) => {
            const owner = genesisCompleteFixture("origin-owner");
            const other = genesisCompleteFixture("origin-other");
            await Promise.all([
                materializeFixture(runRoot, owner),
                materializeFixture(runRoot, other),
            ]);
            const published = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: owner.prepared.bundleId,
                expectedGeneration: ZERO_GENERATION,
                options: {
                    operationToken: PRIMARY_OPERATION_TOKEN,
                },
            });
            const claimPath = node_path_1.default.join(currentRoot, "reservations", `${FIRST_GENERATION}.claim`);
            const claim = JSON.parse(await (0, promises_1.readlink)(claimPath));
            node_assert_1.default.deepStrictEqual(claim.origin, {
                kind: "bundle",
                bundleId: owner.prepared.bundleId,
            });
            node_assert_1.default.notStrictEqual(other.prepared.bundleId, owner.prepared.bundleId);
            const resealed = {
                ...claim,
                origin: {
                    kind: "bundle",
                    bundleId: other.prepared.bundleId,
                },
            };
            await (0, promises_1.unlink)(claimPath);
            await (0, promises_1.symlink)((0, source_contracts_js_1.taskMapContractCanonicalJson)(resealed), claimPath);
            const degraded = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
            node_assert_1.default.strictEqual(degraded.status, "degraded");
            node_assert_1.default.strictEqual(degraded.head, undefined);
            node_assert_1.default.strictEqual(degraded.generations.length, 0);
            node_assert_1.default.strictEqual(degraded.fault?.generation, FIRST_GENERATION);
            node_assert_1.default.strictEqual(degraded.fault?.code, "generation_corrupt");
            node_assert_1.default.match(degraded.fault?.detail ?? "", /journal|reservation origin|bundle/i);
            node_assert_1.default.strictEqual(published.ref.generation, FIRST_GENERATION);
        });
    });
    (0, node_test_1.it)("recovers a journaled partial object and completes on a new-token retry", async () => {
        await withStores(async ({ runRoot, currentRoot }) => {
            const fixture = genesisCompleteFixture("receipt-recovery");
            await materializeFixture(runRoot, fixture);
            const error = await expectCurrentError((0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
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
            }), "write_failed");
            node_assert_1.default.strictEqual(error.committed, false);
            const receipt = error.recoveryReceipt;
            node_assert_1.default.ok(receipt);
            node_assert_1.default.strictEqual(receipt.operationToken, PRIMARY_OPERATION_TOKEN);
            const objectPath = node_path_1.default.join(currentRoot, "objects", receipt.objectName);
            const partialStats = await (0, promises_1.lstat)(objectPath, { bigint: true });
            node_assert_1.default.strictEqual(typeof partialStats.dev, "bigint");
            node_assert_1.default.strictEqual(typeof partialStats.ino, "bigint");
            node_assert_1.default.strictEqual(partialStats.nlink, 1n);
            node_assert_1.default.ok(partialStats.size > 0n);
            node_assert_1.default.ok(partialStats.size < BigInt(receipt.byteLength));
            node_assert_1.default.deepStrictEqual(await reservationEntries(currentRoot), [
                `${FIRST_GENERATION}.claim`,
                `${FIRST_GENERATION}.identity`,
            ]);
            node_assert_1.default.strictEqual(await (0, refresh_current_ref_js_1.recoverTaskMapRefreshCurrentResidue)(currentRoot, runRoot, receipt), "recovered");
            const recoveredStats = await (0, promises_1.lstat)(objectPath, { bigint: true });
            node_assert_1.default.strictEqual(recoveredStats.dev, partialStats.dev);
            node_assert_1.default.strictEqual(recoveredStats.ino, partialStats.ino);
            node_assert_1.default.strictEqual(recoveredStats.nlink, 1n);
            node_assert_1.default.strictEqual(recoveredStats.size, BigInt(receipt.byteLength));
            node_assert_1.default.strictEqual(await (0, refresh_current_ref_js_1.recoverTaskMapRefreshCurrentResidue)(currentRoot, runRoot, receipt), "already_complete");
            const completed = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: fixture.prepared.bundleId,
                expectedGeneration: ZERO_GENERATION,
                options: {
                    operationToken: RETRY_OPERATION_TOKEN,
                },
            });
            node_assert_1.default.strictEqual(completed.status, "published");
            node_assert_1.default.strictEqual(completed.ref.refId, receipt.refId);
            const generationPath = node_path_1.default.join(currentRoot, "generations", `${FIRST_GENERATION}.ref`);
            const [finalObjectStats, generationStats] = await Promise.all([
                (0, promises_1.lstat)(objectPath, { bigint: true }),
                (0, promises_1.lstat)(generationPath, { bigint: true }),
            ]);
            node_assert_1.default.strictEqual(typeof finalObjectStats.dev, "bigint");
            node_assert_1.default.strictEqual(typeof finalObjectStats.ino, "bigint");
            node_assert_1.default.strictEqual(finalObjectStats.dev, partialStats.dev);
            node_assert_1.default.strictEqual(finalObjectStats.ino, partialStats.ino);
            node_assert_1.default.strictEqual(finalObjectStats.dev, generationStats.dev);
            node_assert_1.default.strictEqual(finalObjectStats.ino, generationStats.ino);
            node_assert_1.default.strictEqual(finalObjectStats.nlink, 2n);
            node_assert_1.default.strictEqual(generationStats.nlink, 2n);
            node_assert_1.default.strictEqual((await reservationEntries(currentRoot)).length, 2);
            const exactRetry = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: fixture.prepared.bundleId,
                expectedGeneration: ZERO_GENERATION,
                options: {
                    operationToken: "dddddddddddddddddddddddddddddddd",
                },
            });
            node_assert_1.default.strictEqual(exactRetry.status, "already_current");
            node_assert_1.default.strictEqual(exactRetry.ref.refId, completed.ref.refId);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "generations")), [`${FIRST_GENERATION}.ref`]);
        });
    });
    (0, node_test_1.it)("resumes a real SIGKILL partial write without replacing unknown residue", async () => {
        await withStores(async ({ runRoot, currentRoot }) => {
            const fixture = genesisCompleteFixture("sigkill-partial");
            await materializeFixture(runRoot, fixture);
            const unknown = await createUnknownObjectSentinel(currentRoot, "partial-write");
            const killed = await runSigkillFaultChild({
                currentRoot,
                runRoot,
                bundleId: fixture.prepared.bundleId,
                faultPoint: "after_object_partial_write",
                operationToken: PRIMARY_OPERATION_TOKEN,
            });
            assertSigkilled(killed);
            const afterCrash = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
            node_assert_1.default.strictEqual(afterCrash.status, "empty");
            const objectNames = await claimedObjectNames(currentRoot);
            node_assert_1.default.strictEqual(objectNames.length, 1);
            const objectPath = node_path_1.default.join(currentRoot, "objects", objectNames[0]);
            const partialStats = await (0, promises_1.lstat)(objectPath, { bigint: true });
            node_assert_1.default.strictEqual(partialStats.nlink, 1n);
            node_assert_1.default.ok(partialStats.size > 0n);
            node_assert_1.default.deepStrictEqual(await reservationEntries(currentRoot), [
                `${FIRST_GENERATION}.claim`,
                `${FIRST_GENERATION}.identity`,
            ]);
            const claimPath = node_path_1.default.join(currentRoot, "reservations", `${FIRST_GENERATION}.claim`);
            const claimBeforeRestart = await (0, promises_1.readlink)(claimPath);
            const restarted = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: fixture.prepared.bundleId,
                expectedGeneration: ZERO_GENERATION,
                options: {
                    operationToken: RETRY_OPERATION_TOKEN,
                },
            });
            node_assert_1.default.strictEqual(restarted.status, "published");
            node_assert_1.default.strictEqual(await (0, promises_1.readlink)(claimPath), claimBeforeRestart);
            const generationPath = node_path_1.default.join(currentRoot, "generations", `${FIRST_GENERATION}.ref`);
            const [objectStats, generationStats] = await Promise.all([
                (0, promises_1.lstat)(objectPath, { bigint: true }),
                (0, promises_1.lstat)(generationPath, { bigint: true }),
            ]);
            node_assert_1.default.strictEqual(typeof objectStats.dev, "bigint");
            node_assert_1.default.strictEqual(typeof objectStats.ino, "bigint");
            node_assert_1.default.strictEqual(objectStats.dev, partialStats.dev);
            node_assert_1.default.strictEqual(objectStats.ino, partialStats.ino);
            node_assert_1.default.strictEqual(objectStats.dev, generationStats.dev);
            node_assert_1.default.strictEqual(objectStats.ino, generationStats.ino);
            node_assert_1.default.strictEqual(objectStats.nlink, 2n);
            node_assert_1.default.strictEqual(generationStats.nlink, 2n);
            node_assert_1.default.ok(partialStats.size < objectStats.size);
            node_assert_1.default.strictEqual((await claimedObjectNames(currentRoot)).length, 1);
            node_assert_1.default.strictEqual((await reservationEntries(currentRoot)).length, 2);
            await assertUnknownObjectPreserved(unknown);
        });
    });
    (0, node_test_1.it)("reconstructs identity after a real SIGKILL before the identity journal", async () => {
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
            node_assert_1.default.deepStrictEqual(await reservationEntries(currentRoot), [`${FIRST_GENERATION}.claim`]);
            const objectNames = await claimedObjectNames(currentRoot);
            node_assert_1.default.strictEqual(objectNames.length, 1);
            const objectPath = node_path_1.default.join(currentRoot, "objects", objectNames[0]);
            const unjournaledStats = await (0, promises_1.lstat)(objectPath, { bigint: true });
            node_assert_1.default.strictEqual(unjournaledStats.nlink, 1n);
            node_assert_1.default.strictEqual(unjournaledStats.size, 0n);
            const restarted = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: fixture.prepared.bundleId,
                expectedGeneration: ZERO_GENERATION,
                options: {
                    operationToken: RETRY_OPERATION_TOKEN,
                },
            });
            node_assert_1.default.strictEqual(restarted.status, "published");
            node_assert_1.default.deepStrictEqual(await reservationEntries(currentRoot), [
                `${FIRST_GENERATION}.claim`,
                `${FIRST_GENERATION}.identity`,
            ]);
            const generationPath = node_path_1.default.join(currentRoot, "generations", `${FIRST_GENERATION}.ref`);
            const [objectStats, generationStats] = await Promise.all([
                (0, promises_1.lstat)(objectPath, { bigint: true }),
                (0, promises_1.lstat)(generationPath, { bigint: true }),
            ]);
            node_assert_1.default.strictEqual(objectStats.dev, unjournaledStats.dev);
            node_assert_1.default.strictEqual(objectStats.ino, unjournaledStats.ino);
            node_assert_1.default.strictEqual(objectStats.dev, generationStats.dev);
            node_assert_1.default.strictEqual(objectStats.ino, generationStats.ino);
            node_assert_1.default.strictEqual(objectStats.nlink, 2n);
            node_assert_1.default.strictEqual(generationStats.nlink, 2n);
        });
    });
    (0, node_test_1.it)("keeps a synced claim immutable across abandonment and exact restart", async () => {
        await withStores(async ({ runRoot, currentRoot }) => {
            const owner = genesisCompleteFixture("claim-owner");
            const contender = genesisCompleteFixture("claim-contender");
            await Promise.all([
                materializeFixture(runRoot, owner),
                materializeFixture(runRoot, contender),
            ]);
            node_assert_1.default.notStrictEqual(owner.prepared.bundleId, contender.prepared.bundleId);
            const unknown = await createUnknownObjectSentinel(currentRoot, "claim-only");
            const killed = await runSigkillFaultChild({
                currentRoot,
                runRoot,
                bundleId: owner.prepared.bundleId,
                faultPoint: "after_reservation_directory_sync",
                operationToken: PRIMARY_OPERATION_TOKEN,
            });
            assertSigkilled(killed);
            const claimPath = node_path_1.default.join(currentRoot, "reservations", `${FIRST_GENERATION}.claim`);
            const claimBeforeContention = await (0, promises_1.readlink)(claimPath);
            const abandonedClaim = await readReservationClaim(currentRoot);
            node_assert_1.default.deepStrictEqual(abandonedClaim.origin, {
                kind: "bundle",
                bundleId: owner.prepared.bundleId,
            });
            node_assert_1.default.deepStrictEqual(await reservationEntries(currentRoot), [`${FIRST_GENERATION}.claim`]);
            node_assert_1.default.strictEqual((await claimedObjectNames(currentRoot)).length, 0);
            node_assert_1.default.strictEqual((await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot)).status, "empty");
            const loser = await expectCurrentError((0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: contender.prepared.bundleId,
                expectedGeneration: ZERO_GENERATION,
                options: {
                    operationToken: "cccccccccccccccccccccccccccccccc",
                },
            }), "recovery_required");
            node_assert_1.default.strictEqual(loser.recoveryReceipt, undefined);
            const pendingRecovery = loser.pendingRecovery;
            node_assert_1.default.ok(pendingRecovery);
            node_assert_1.default.strictEqual(pendingRecovery.generation, FIRST_GENERATION);
            node_assert_1.default.strictEqual(pendingRecovery.refId, abandonedClaim.refId);
            node_assert_1.default.deepStrictEqual(pendingRecovery.origin, {
                kind: "bundle",
                bundleId: owner.prepared.bundleId,
            });
            node_assert_1.default.strictEqual(pendingRecovery.state, "claim_only");
            node_assert_1.default.strictEqual("operationToken" in pendingRecovery, false);
            node_assert_1.default.strictEqual(await (0, promises_1.readlink)(claimPath), claimBeforeContention);
            node_assert_1.default.strictEqual((await claimedObjectNames(currentRoot)).length, 0);
            node_assert_1.default.strictEqual((await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot)).status, "empty");
            const restarted = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: owner.prepared.bundleId,
                expectedGeneration: ZERO_GENERATION,
                options: {
                    operationToken: RETRY_OPERATION_TOKEN,
                },
            });
            node_assert_1.default.strictEqual(restarted.status, "published");
            node_assert_1.default.strictEqual(restarted.ref.generation, FIRST_GENERATION);
            node_assert_1.default.strictEqual(await (0, promises_1.readlink)(claimPath), claimBeforeContention);
            const claim = await readReservationClaim(currentRoot);
            node_assert_1.default.strictEqual(claim.refId, restarted.ref.refId);
            const objectNames = await claimedObjectNames(currentRoot);
            node_assert_1.default.deepStrictEqual(objectNames, [claim.objectName]);
            node_assert_1.default.deepStrictEqual(await reservationEntries(currentRoot), [
                `${FIRST_GENERATION}.claim`,
                `${FIRST_GENERATION}.identity`,
            ]);
            const [objectStats, generationStats] = await Promise.all([
                (0, promises_1.lstat)(node_path_1.default.join(currentRoot, "objects", claim.objectName), { bigint: true }),
                (0, promises_1.lstat)(node_path_1.default.join(currentRoot, "generations", `${FIRST_GENERATION}.ref`), { bigint: true }),
            ]);
            node_assert_1.default.strictEqual(objectStats.dev, generationStats.dev);
            node_assert_1.default.strictEqual(objectStats.ino, generationStats.ino);
            node_assert_1.default.strictEqual(objectStats.nlink, 2n);
            await assertUnknownObjectPreserved(unknown);
        });
    });
    (0, node_test_1.it)("refuses occupied legacy object paths without mutating empty or exact-prefix bytes", async () => {
        await withStores(async ({ runRoot, currentRoot }) => {
            const fixture = genesisCompleteFixture("legacy-empty");
            await materializeFixture(runRoot, fixture);
            const interrupted = await expectCurrentError((0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
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
            }), "write_failed");
            node_assert_1.default.strictEqual(interrupted.recoveryReceipt, undefined);
            const claim = await readReservationClaim(currentRoot);
            const legacyPath = node_path_1.default.join(currentRoot, "objects", `${claim.refId}.json`);
            await (0, promises_1.writeFile)(legacyPath, Buffer.alloc(0), { mode: 0o600 });
            const before = await (0, promises_1.lstat)(legacyPath, { bigint: true });
            await expectCurrentError((0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: fixture.prepared.bundleId,
                expectedGeneration: ZERO_GENERATION,
                options: {
                    operationToken: RETRY_OPERATION_TOKEN,
                },
            }), "unsafe_target");
            const after = await (0, promises_1.lstat)(legacyPath, { bigint: true });
            node_assert_1.default.strictEqual(after.dev, before.dev);
            node_assert_1.default.strictEqual(after.ino, before.ino);
            node_assert_1.default.strictEqual(after.size, 0n);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readFile)(legacyPath), Buffer.alloc(0));
            node_assert_1.default.strictEqual((await claimedObjectNames(currentRoot)).length, 0);
            node_assert_1.default.deepStrictEqual(await reservationEntries(currentRoot), [`${FIRST_GENERATION}.claim`]);
            node_assert_1.default.strictEqual((await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot)).status, "empty");
        });
        await withStores(async ({ runRoot, currentRoot }) => {
            const fixture = genesisCompleteFixture("legacy-prefix");
            await materializeFixture(runRoot, fixture);
            const interrupted = await expectCurrentError((0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
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
            }), "write_failed");
            const receipt = interrupted.recoveryReceipt;
            node_assert_1.default.ok(receipt);
            const claimedPath = node_path_1.default.join(currentRoot, "objects", receipt.objectName);
            const exactPrefix = await (0, promises_1.readFile)(claimedPath);
            node_assert_1.default.ok(exactPrefix.length > 0);
            node_assert_1.default.ok(exactPrefix.length < receipt.byteLength);
            const legacyPath = node_path_1.default.join(currentRoot, "objects", `${receipt.refId}.json`);
            await (0, promises_1.writeFile)(legacyPath, exactPrefix, { mode: 0o600 });
            const [legacyBefore, claimedBefore] = await Promise.all([
                (0, promises_1.lstat)(legacyPath, { bigint: true }),
                (0, promises_1.lstat)(claimedPath, { bigint: true }),
            ]);
            await expectCurrentError((0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: fixture.prepared.bundleId,
                expectedGeneration: ZERO_GENERATION,
                options: {
                    operationToken: RETRY_OPERATION_TOKEN,
                },
            }), "unsafe_target");
            const [legacyAfter, claimedAfter] = await Promise.all([
                (0, promises_1.lstat)(legacyPath, { bigint: true }),
                (0, promises_1.lstat)(claimedPath, { bigint: true }),
            ]);
            node_assert_1.default.strictEqual(legacyAfter.dev, legacyBefore.dev);
            node_assert_1.default.strictEqual(legacyAfter.ino, legacyBefore.ino);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readFile)(legacyPath), exactPrefix);
            node_assert_1.default.strictEqual(claimedAfter.dev, claimedBefore.dev);
            node_assert_1.default.strictEqual(claimedAfter.ino, claimedBefore.ino);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readFile)(claimedPath), exactPrefix);
            node_assert_1.default.strictEqual((await claimedObjectNames(currentRoot)).length, 1);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "generations")), []);
            node_assert_1.default.strictEqual((await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot)).status, "empty");
        });
    });
    (0, node_test_1.it)("admits exactly one distinct candidate under N-way genesis contention", async () => {
        await withStores(async ({ runRoot, currentRoot }) => {
            const candidateCount = 16;
            const candidates = Array.from({ length: candidateCount }, (_, index) => genesisCompleteFixture(`contention-${index}`));
            node_assert_1.default.strictEqual(new Set(candidates.map((candidate) => candidate.prepared.bundleId)).size, candidateCount);
            await Promise.all(candidates.map((candidate) => (materializeFixture(runRoot, candidate))));
            let releaseWinner;
            const winnerRelease = new Promise((resolve) => {
                releaseWinner = resolve;
            });
            let markReservationLinked;
            const reservationLinked = new Promise((resolve) => {
                markReservationLinked = resolve;
            });
            let markAllLosersSettled;
            const allLosersSettled = new Promise((resolve) => {
                markAllLosersSettled = resolve;
            });
            let rejectedBeforeObject = 0;
            const attempts = candidates.map((candidate, index) => ((0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
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
            }).catch((error) => {
                rejectedBeforeObject += 1;
                if (rejectedBeforeObject === candidateCount - 1) {
                    markAllLosersSettled();
                }
                throw error;
            })));
            const settledPromise = Promise.allSettled(attempts);
            await reservationLinked;
            await allLosersSettled;
            let precommitClaim;
            try {
                node_assert_1.default.deepStrictEqual(await reservationEntries(currentRoot), [`${FIRST_GENERATION}.claim`]);
                node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "objects")), []);
                precommitClaim = await readReservationClaim(currentRoot);
            }
            finally {
                releaseWinner();
            }
            const settled = await settledPromise;
            const winners = settled.filter((result) => result.status === "fulfilled");
            const losers = settled.filter((result) => (result.status === "rejected"));
            node_assert_1.default.strictEqual(winners.length, 1);
            node_assert_1.default.strictEqual(winners[0].value.status, "published");
            node_assert_1.default.strictEqual(winners[0].value.ref.generation, FIRST_GENERATION);
            node_assert_1.default.strictEqual(losers.length, candidateCount - 1);
            for (const loser of losers) {
                node_assert_1.default.ok(loser.reason instanceof refresh_current_ref_js_1.TaskMapRefreshCurrentError);
                node_assert_1.default.strictEqual(loser.reason.code, "recovery_required");
                node_assert_1.default.strictEqual(loser.reason.committed, false);
                node_assert_1.default.strictEqual(loser.reason.recoveryReceipt, undefined);
                const pendingRecovery = loser.reason.pendingRecovery;
                node_assert_1.default.ok(pendingRecovery);
                node_assert_1.default.strictEqual(pendingRecovery.generation, FIRST_GENERATION);
                node_assert_1.default.strictEqual(pendingRecovery.refId, precommitClaim.refId);
                node_assert_1.default.deepStrictEqual(pendingRecovery.origin, precommitClaim.origin);
                node_assert_1.default.strictEqual(pendingRecovery.state, "claim_only");
                node_assert_1.default.strictEqual("operationToken" in pendingRecovery, false);
            }
            const objectNames = await claimedObjectNames(currentRoot);
            node_assert_1.default.strictEqual(objectNames.length, 1);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "generations")), [`${FIRST_GENERATION}.ref`]);
            node_assert_1.default.deepStrictEqual(await reservationEntries(currentRoot), [
                `${FIRST_GENERATION}.claim`,
                `${FIRST_GENERATION}.identity`,
            ]);
            const claim = await readReservationClaim(currentRoot);
            node_assert_1.default.strictEqual(claim.refId, winners[0].value.ref.refId);
            node_assert_1.default.strictEqual(objectNames[0], claim.objectName);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "objects")), [claim.objectName]);
            const [objectStats, generationStats] = await Promise.all([
                (0, promises_1.lstat)(node_path_1.default.join(currentRoot, "objects", objectNames[0]), { bigint: true }),
                (0, promises_1.lstat)(node_path_1.default.join(currentRoot, "generations", `${FIRST_GENERATION}.ref`), { bigint: true }),
            ]);
            node_assert_1.default.strictEqual(objectStats.dev, generationStats.dev);
            node_assert_1.default.strictEqual(objectStats.ino, generationStats.ino);
            node_assert_1.default.strictEqual(objectStats.nlink, 2n);
            node_assert_1.default.strictEqual(generationStats.nlink, 2n);
            const snapshot = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
            node_assert_1.default.strictEqual(snapshot.status, "healthy");
            node_assert_1.default.strictEqual(snapshot.generations.length, 1);
            node_assert_1.default.strictEqual(snapshot.head?.refId, winners[0].value.ref.refId);
        });
    });
    (0, node_test_1.it)("converges 32 release-gated same-candidate writers without extra residue", async () => {
        const writerCount = 32;
        const rounds = 3;
        for (let round = 0; round < rounds; round += 1) {
            await withStores(async ({ runRoot, currentRoot }) => {
                const fixture = genesisCompleteFixture(`same-candidate-${round}`);
                await materializeFixture(runRoot, fixture);
                let releaseStart;
                const start = new Promise((resolve) => {
                    releaseStart = resolve;
                });
                let markAllReady;
                const allReady = new Promise((resolve) => {
                    markAllReady = resolve;
                });
                let ready = 0;
                const attempts = Array.from({ length: writerCount }, (_, index) => (async () => {
                    ready += 1;
                    if (ready === writerCount)
                        markAllReady();
                    await start;
                    return (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
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
                })());
                await allReady;
                releaseStart();
                const results = await Promise.all(attempts);
                node_assert_1.default.strictEqual(results.filter((result) => result.status === "published").length, 1);
                node_assert_1.default.strictEqual(results.filter((result) => result.status === "already_current").length, writerCount - 1);
                node_assert_1.default.strictEqual(new Set(results.map((result) => result.ref.refId)).size, 1);
                const claim = await readReservationClaim(currentRoot);
                node_assert_1.default.strictEqual(claim.refId, results[0].ref.refId);
                node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "objects")), [claim.objectName]);
                node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "generations")), [`${FIRST_GENERATION}.ref`]);
                node_assert_1.default.deepStrictEqual(await reservationEntries(currentRoot), [
                    `${FIRST_GENERATION}.claim`,
                    `${FIRST_GENERATION}.identity`,
                ]);
                const [objectStats, generationStats] = await Promise.all([
                    (0, promises_1.lstat)(node_path_1.default.join(currentRoot, "objects", claim.objectName), { bigint: true }),
                    (0, promises_1.lstat)(node_path_1.default.join(currentRoot, "generations", `${FIRST_GENERATION}.ref`), { bigint: true }),
                ]);
                node_assert_1.default.strictEqual(objectStats.dev, generationStats.dev);
                node_assert_1.default.strictEqual(objectStats.ino, generationStats.ino);
                node_assert_1.default.strictEqual(objectStats.nlink, 2n);
                node_assert_1.default.strictEqual(generationStats.nlink, 2n);
                const snapshot = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
                node_assert_1.default.strictEqual(snapshot.status, "healthy");
                node_assert_1.default.strictEqual(snapshot.generations.length, 1);
            });
        }
    });
    (0, node_test_1.it)("keeps genesis retryable after a blocked pre-acceptance attempt", async () => {
        await withStores(async ({ runRoot, currentRoot }) => {
            const blocked = genesisBlockedFixture();
            const complete = genesisCompleteFixture();
            await materializeFixture(runRoot, blocked);
            await materializeFixture(runRoot, complete);
            const first = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: blocked.prepared.bundleId,
                expectedGeneration: ZERO_GENERATION,
            });
            node_assert_1.default.strictEqual(first.ref.operation, "blocked");
            node_assert_1.default.strictEqual(first.ref.accepted, undefined);
            node_assert_1.default.strictEqual(first.ref.connectorHeads.length, 1);
            const second = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: complete.prepared.bundleId,
                expectedGeneration: FIRST_GENERATION,
                expectedRefId: first.ref.refId,
            });
            node_assert_1.default.strictEqual(second.ref.operation, "complete");
            node_assert_1.default.strictEqual(second.ref.accepted?.originGeneration, "00000000000000000002");
            node_assert_1.default.strictEqual(second.ref.connectorHeads.length, 1);
            node_assert_1.default.strictEqual(second.ref.connectorHeads[0].latestCheckpoint.checkpointDigest, (0, source_contracts_js_1.taskMapContractDigest)(complete.checkpoint));
            const snapshot = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
            node_assert_1.default.strictEqual(snapshot.status, "healthy");
            node_assert_1.default.strictEqual(snapshot.generations.length, 2);
        });
    });
    (0, node_test_1.it)("starts an adapter upgrade as a new full lineage and retains the old one", async () => {
        await withStores(async ({ runRoot, currentRoot }) => {
            const firstFixture = genesisCompleteFixture();
            const upgrade = adapterUpgradeFixture(firstFixture);
            await materializeFixture(runRoot, firstFixture);
            await materializeFixture(runRoot, upgrade);
            const first = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: firstFixture.prepared.bundleId,
                expectedGeneration: ZERO_GENERATION,
            });
            const second = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: upgrade.prepared.bundleId,
                expectedGeneration: FIRST_GENERATION,
                expectedRefId: first.ref.refId,
            });
            node_assert_1.default.strictEqual(second.ref.connectorHeads.length, 2);
            node_assert_1.default.deepStrictEqual(second.ref.connectorHeads.map((head) => head.adapterVersion).sort(), ["strategy-adapter.1", "strategy-adapter.2"]);
            const upgradedHead = second.ref.connectorHeads.find((head) => head.adapterVersion === "strategy-adapter.2");
            node_assert_1.default.strictEqual(upgradedHead.latestCheckpoint.checkpointDigest, (0, source_contracts_js_1.taskMapContractDigest)(upgrade.checkpoint));
            node_assert_1.default.deepStrictEqual(upgrade.checkpoint.watermarkHistoryDigests, [upgrade.checkpoint.watermark.valueDigest]);
            const reopened = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
            node_assert_1.default.strictEqual(reopened.status, "healthy");
            node_assert_1.default.strictEqual(reopened.generations.length, 2);
            node_assert_1.default.strictEqual(reopened.head?.refId, second.ref.refId);
        });
    });
    (0, node_test_1.it)("rejects a semantic baseline spliced onto a true accepted digest", async () => {
        await withStores(async ({ runRoot, currentRoot }) => {
            const firstFixture = genesisCompleteFixture();
            const forged = adapterUpgradeFixture(firstFixture, (baseline) => {
                baseline.acceptedSemanticInputDigests = [
                    digest("forged-accepted-semantic-input"),
                ];
            });
            await materializeFixture(runRoot, firstFixture);
            await materializeFixture(runRoot, forged);
            const first = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: firstFixture.prepared.bundleId,
                expectedGeneration: ZERO_GENERATION,
            });
            await expectCurrentError((0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: forged.prepared.bundleId,
                expectedGeneration: FIRST_GENERATION,
                expectedRefId: first.ref.refId,
            }), "invalid_contract");
            const snapshot = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
            node_assert_1.default.strictEqual(snapshot.status, "healthy");
            node_assert_1.default.strictEqual(snapshot.generations.length, 1);
        });
    });
    (0, node_test_1.it)("never promotes a baseline artifact sourced only from a blocked attempt", async () => {
        await withStores(async ({ runRoot, currentRoot }) => {
            const accepted = genesisCompleteFixture();
            const blocked = blockedAdapterAttemptFixture(accepted);
            const spliced = splicedBlockedArtifactFixture(accepted, blocked);
            await materializeFixture(runRoot, accepted);
            await materializeFixture(runRoot, blocked);
            await materializeFixture(runRoot, spliced);
            const first = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: accepted.prepared.bundleId,
                expectedGeneration: ZERO_GENERATION,
            });
            const second = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: blocked.prepared.bundleId,
                expectedGeneration: FIRST_GENERATION,
                expectedRefId: first.ref.refId,
            });
            node_assert_1.default.strictEqual(second.ref.operation, "blocked");
            node_assert_1.default.strictEqual(second.ref.accepted?.bundleId, accepted.prepared.bundleId);
            await expectCurrentError((0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: spliced.prepared.bundleId,
                expectedGeneration: "00000000000000000002",
                expectedRefId: second.ref.refId,
            }), "invalid_contract");
            const snapshot = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
            node_assert_1.default.strictEqual(snapshot.status, "healthy");
            node_assert_1.default.strictEqual(snapshot.generations.length, 2);
        });
    });
    (0, node_test_1.it)("keeps accepted semantics at G1 while mixed connector heads make forward progress", async () => {
        await withStores(async ({ runRoot, currentRoot }) => {
            const bindingADigest = (0, source_contracts_js_1.taskMapContractDigest)(BINDING);
            const bindingBDigest = (0, source_contracts_js_1.taskMapContractDigest)(SECOND_BINDING);
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
            const a1 = semanticSuccessfulCheckpoint(null, g1Snapshot, BINDING, "mixed-a1", "2026-07-28T10:10:00.000Z");
            const b1 = semanticSuccessfulCheckpoint(null, g1Snapshot, SECOND_BINDING, "mixed-b1", "2026-07-28T10:11:00.000Z");
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
            const a2 = semanticSuccessfulCheckpoint(a1, g2Snapshot, BINDING, "mixed-a2", "2026-07-28T11:10:00.000Z");
            const b2Failed = semanticFailedCheckpoint(b1, SECOND_BINDING, "mixed-b2", "2026-07-28T11:11:00.000Z");
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
            const a3 = semanticSuccessfulCheckpoint(a2, g3Snapshot, BINDING, "mixed-a3", "2026-07-28T12:10:00.000Z");
            const b3 = semanticSuccessfulCheckpoint(b2Failed, g3Snapshot, SECOND_BINDING, "mixed-b3", "2026-07-28T12:11:00.000Z");
            const g3 = semanticPublicationFixture({
                label: "mixed-g3-complete",
                snapshot: g3Snapshot,
                attemptCheckpoints: [a3, b3],
                publicationState: "complete",
                acceptedOrigin: g1,
            });
            node_assert_1.default.strictEqual(g3.plan.baseline.kind, "accepted");
            if (g3.plan.baseline.kind !== "accepted")
                node_assert_1.default.fail();
            node_assert_1.default.strictEqual(g3.plan.baseline.priorAcceptedStateDigest, g1.plan.candidateAcceptedStateDigest);
            node_assert_1.default.deepStrictEqual(g3.plan.baseline.priorCheckpointDigests, [(0, source_contracts_js_1.taskMapContractDigest)(a1), (0, source_contracts_js_1.taskMapContractDigest)(b1)].sort());
            node_assert_1.default.deepStrictEqual(a3.watermarkHistoryDigests, [
                a1.watermark.valueDigest,
                a2.watermark.valueDigest,
                a3.watermark.valueDigest,
            ].sort());
            node_assert_1.default.strictEqual(b2Failed.state, "failed");
            node_assert_1.default.strictEqual(b2Failed.watermark.valueDigest, b1.watermark.valueDigest);
            node_assert_1.default.deepStrictEqual(b3.watermarkHistoryDigests, [
                b1.watermark.valueDigest,
                b3.watermark.valueDigest,
            ].sort());
            await Promise.all([
                materializeFixture(runRoot, g1),
                materializeFixture(runRoot, g2),
                materializeFixture(runRoot, g3),
            ]);
            const first = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: g1.prepared.bundleId,
                expectedGeneration: ZERO_GENERATION,
            });
            const second = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: g2.prepared.bundleId,
                expectedGeneration: FIRST_GENERATION,
                expectedRefId: first.ref.refId,
            });
            node_assert_1.default.strictEqual(second.ref.operation, "blocked");
            node_assert_1.default.strictEqual(second.ref.accepted?.bundleId, g1.prepared.bundleId);
            node_assert_1.default.strictEqual(second.ref.accepted?.originGeneration, FIRST_GENERATION);
            const secondA = second.ref.connectorHeads.find((head) => head.bindingDigest === bindingADigest);
            const secondB = second.ref.connectorHeads.find((head) => head.bindingDigest === bindingBDigest);
            node_assert_1.default.ok(secondA);
            node_assert_1.default.ok(secondB);
            node_assert_1.default.strictEqual(secondA.latestCheckpoint.checkpointDigest, (0, source_contracts_js_1.taskMapContractDigest)(a2));
            node_assert_1.default.strictEqual(secondA.lastGood?.checkpointDigest, (0, source_contracts_js_1.taskMapContractDigest)(a2));
            node_assert_1.default.strictEqual(secondB.latestCheckpoint.checkpointDigest, (0, source_contracts_js_1.taskMapContractDigest)(b2Failed));
            node_assert_1.default.strictEqual(secondB.lastGood?.checkpointDigest, (0, source_contracts_js_1.taskMapContractDigest)(b1));
            const third = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: g3.prepared.bundleId,
                expectedGeneration: SECOND_GENERATION,
                expectedRefId: second.ref.refId,
            });
            node_assert_1.default.strictEqual(third.ref.operation, "complete");
            node_assert_1.default.strictEqual(third.ref.accepted?.bundleId, g3.prepared.bundleId);
            node_assert_1.default.strictEqual(third.ref.accepted?.originGeneration, THIRD_GENERATION);
            const thirdA = third.ref.connectorHeads.find((head) => head.bindingDigest === bindingADigest);
            const thirdB = third.ref.connectorHeads.find((head) => head.bindingDigest === bindingBDigest);
            node_assert_1.default.ok(thirdA);
            node_assert_1.default.ok(thirdB);
            node_assert_1.default.strictEqual(thirdA.latestCheckpoint.checkpointDigest, (0, source_contracts_js_1.taskMapContractDigest)(a3));
            node_assert_1.default.strictEqual(thirdA.lastGood?.checkpointDigest, (0, source_contracts_js_1.taskMapContractDigest)(a3));
            node_assert_1.default.strictEqual(thirdB.latestCheckpoint.checkpointDigest, (0, source_contracts_js_1.taskMapContractDigest)(b3));
            node_assert_1.default.strictEqual(thirdB.lastGood?.checkpointDigest, (0, source_contracts_js_1.taskMapContractDigest)(b3));
            const reopened = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
            node_assert_1.default.strictEqual(reopened.status, "healthy");
            node_assert_1.default.strictEqual(reopened.generations.length, 3);
            node_assert_1.default.strictEqual(reopened.head?.refId, third.ref.refId);
        });
    });
    (0, node_test_1.it)("appends rollback while preserving attempt and connector progress for a later forward publish", async () => {
        await withStores(async ({ runRoot, currentRoot }) => {
            const g1Snapshot = semanticSourceSnapshot([{
                    binding: BINDING,
                    sourceObjectId: "rollback-forward-object",
                    sourceRevision: "rollback-r1",
                    contentDigest: digest("rollback-forward-c1"),
                    eventTime: "2026-07-28T13:00:00.000Z",
                }]);
            const checkpoint1 = semanticSuccessfulCheckpoint(null, g1Snapshot, BINDING, "rollback-forward-1", "2026-07-28T13:10:00.000Z");
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
            const checkpoint2 = semanticSuccessfulCheckpoint(checkpoint1, g2Snapshot, BINDING, "rollback-forward-2", "2026-07-28T14:10:00.000Z");
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
            const checkpoint4 = semanticSuccessfulCheckpoint(checkpoint2, g4Snapshot, BINDING, "rollback-forward-4", "2026-07-28T15:10:00.000Z");
            const g4 = semanticPublicationFixture({
                label: "rollback-forward-g4",
                snapshot: g4Snapshot,
                attemptCheckpoints: [checkpoint4],
                publicationState: "complete",
                acceptedOrigin: g1,
            });
            node_assert_1.default.strictEqual(g4.plan.baseline.kind, "accepted");
            if (g4.plan.baseline.kind !== "accepted")
                node_assert_1.default.fail();
            node_assert_1.default.strictEqual(g4.plan.baseline.priorAcceptedStateDigest, g1.plan.candidateAcceptedStateDigest);
            node_assert_1.default.deepStrictEqual(g4.plan.baseline.priorCheckpointDigests, [(0, source_contracts_js_1.taskMapContractDigest)(checkpoint1)]);
            node_assert_1.default.deepStrictEqual(checkpoint4.watermarkHistoryDigests, [
                checkpoint1.watermark.valueDigest,
                checkpoint2.watermark.valueDigest,
                checkpoint4.watermark.valueDigest,
            ].sort());
            await Promise.all([
                materializeFixture(runRoot, g1),
                materializeFixture(runRoot, g2),
                materializeFixture(runRoot, g4),
            ]);
            const first = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: g1.prepared.bundleId,
                expectedGeneration: ZERO_GENERATION,
            });
            const second = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: g2.prepared.bundleId,
                expectedGeneration: FIRST_GENERATION,
                expectedRefId: first.ref.refId,
            });
            const rollback = await (0, refresh_current_ref_js_1.rollbackTaskMapRefreshCurrent)({
                currentRoot,
                runRoot,
                targetGeneration: FIRST_GENERATION,
                expectedGeneration: SECOND_GENERATION,
                expectedRefId: second.ref.refId,
            });
            node_assert_1.default.strictEqual(rollback.ref.generation, THIRD_GENERATION);
            node_assert_1.default.strictEqual(rollback.ref.operation, "rollback");
            node_assert_1.default.deepStrictEqual(rollback.ref.attempt, second.ref.attempt);
            node_assert_1.default.deepStrictEqual(rollback.ref.connectorHeads, second.ref.connectorHeads);
            node_assert_1.default.deepStrictEqual(rollback.ref.accepted, first.ref.accepted);
            node_assert_1.default.strictEqual(rollback.ref.rollback?.targetGeneration, FIRST_GENERATION);
            node_assert_1.default.strictEqual(rollback.ref.connectorHeads[0]
                .latestCheckpoint.checkpointDigest, (0, source_contracts_js_1.taskMapContractDigest)(checkpoint2));
            const fourth = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: g4.prepared.bundleId,
                expectedGeneration: THIRD_GENERATION,
                expectedRefId: rollback.ref.refId,
            });
            node_assert_1.default.strictEqual(fourth.ref.generation, FOURTH_GENERATION);
            node_assert_1.default.strictEqual(fourth.ref.operation, "complete");
            node_assert_1.default.strictEqual(fourth.ref.accepted?.originGeneration, FOURTH_GENERATION);
            node_assert_1.default.strictEqual(fourth.ref.connectorHeads[0]
                .latestCheckpoint.checkpointDigest, (0, source_contracts_js_1.taskMapContractDigest)(checkpoint4));
            node_assert_1.default.strictEqual(fourth.ref.attempt?.generation, FOURTH_GENERATION);
            const reopened = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
            node_assert_1.default.strictEqual(reopened.status, "healthy");
            node_assert_1.default.strictEqual(reopened.generations.length, 4);
            node_assert_1.default.strictEqual(reopened.head?.refId, fourth.ref.refId);
        });
    });
    (0, node_test_1.it)("rejects conflicting content for a source revision accepted before rollback", async () => {
        await withStores(async ({ runRoot, currentRoot }) => {
            const sourceObjectId = "immutable-revision-ledger-object";
            const g1Snapshot = semanticSourceSnapshot([{
                    binding: BINDING,
                    sourceObjectId,
                    sourceRevision: "ledger-r1",
                    contentDigest: digest("ledger-c1"),
                    eventTime: "2026-07-28T16:00:00.000Z",
                }]);
            const checkpoint1 = semanticSuccessfulCheckpoint(null, g1Snapshot, BINDING, "ledger-1", "2026-07-28T16:10:00.000Z");
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
            const checkpoint2 = semanticSuccessfulCheckpoint(checkpoint1, g2Snapshot, BINDING, "ledger-2", "2026-07-28T17:10:00.000Z");
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
            node_assert_1.default.strictEqual(conflictingSnapshot.envelopes[0].sourceIdentityDigest, g2Snapshot.envelopes[0].sourceIdentityDigest);
            node_assert_1.default.strictEqual((0, source_contracts_js_1.taskMapContractDigest)(conflictingSnapshot.envelopes[0].sourceRevision), (0, source_contracts_js_1.taskMapContractDigest)(g2Snapshot.envelopes[0].sourceRevision));
            node_assert_1.default.notStrictEqual(conflictingSnapshot.envelopes[0].contentDigest, g2Snapshot.envelopes[0].contentDigest);
            const conflictingCheckpoint = semanticSuccessfulCheckpoint(checkpoint2, conflictingSnapshot, BINDING, "ledger-4-conflict", "2026-07-28T18:10:00.000Z");
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
            const first = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: g1.prepared.bundleId,
                expectedGeneration: ZERO_GENERATION,
            });
            const second = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: g2.prepared.bundleId,
                expectedGeneration: FIRST_GENERATION,
                expectedRefId: first.ref.refId,
            });
            const rollback = await (0, refresh_current_ref_js_1.rollbackTaskMapRefreshCurrent)({
                currentRoot,
                runRoot,
                targetGeneration: FIRST_GENERATION,
                expectedGeneration: SECOND_GENERATION,
                expectedRefId: second.ref.refId,
            });
            const error = await expectCurrentError((0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: conflicting.prepared.bundleId,
                expectedGeneration: THIRD_GENERATION,
                expectedRefId: rollback.ref.refId,
            }), "invalid_contract");
            node_assert_1.default.strictEqual(error.committed, false);
            node_assert_1.default.match(error.message, /immutable accepted source history/i);
            const reopened = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
            node_assert_1.default.strictEqual(reopened.status, "healthy");
            node_assert_1.default.strictEqual(reopened.generations.length, 3);
            node_assert_1.default.strictEqual(reopened.head?.generation, THIRD_GENERATION);
            node_assert_1.default.strictEqual(reopened.head?.refId, rollback.ref.refId);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "generations")), [
                `${FIRST_GENERATION}.ref`,
                `${SECOND_GENERATION}.ref`,
                `${THIRD_GENERATION}.ref`,
            ]);
        });
    });
});
function cloneCurrentRef(ref) {
    return structuredClone(ref);
}
function expectSynchronousCurrentError(action, code) {
    let caught;
    try {
        action();
    }
    catch (error) {
        caught = error;
    }
    node_assert_1.default.ok(caught instanceof refresh_current_ref_js_1.TaskMapRefreshCurrentError);
    node_assert_1.default.strictEqual(caught.code, code);
    return caught;
}
async function captureFile(filePath) {
    return {
        path: filePath,
        bytes: await (0, promises_1.readFile)(filePath),
        stats: await (0, promises_1.lstat)(filePath, { bigint: true }),
    };
}
async function assertFilePreserved(before) {
    const after = await (0, promises_1.lstat)(before.path, { bigint: true });
    node_assert_1.default.strictEqual(after.dev, before.stats.dev);
    node_assert_1.default.strictEqual(after.ino, before.stats.ino);
    node_assert_1.default.strictEqual(after.nlink, before.stats.nlink);
    node_assert_1.default.strictEqual(after.size, before.stats.size);
    node_assert_1.default.deepStrictEqual(await (0, promises_1.readFile)(before.path), before.bytes);
}
function poisonableArrayMethodLabel(method) {
    return method === Symbol.iterator ? "iterator" : method;
}
async function withPoisonedArrayMethod(method, action) {
    const original = Object.getOwnPropertyDescriptor(Array.prototype, method);
    if (original === undefined || !("value" in original)) {
        throw new Error(`Array.prototype.${poisonableArrayMethodLabel(method)} has no data descriptor`);
    }
    let calls = 0;
    Object.defineProperty(Array.prototype, method, {
        ...original,
        value() {
            calls += 1;
            throw new Error(`poisoned Array.prototype.${poisonableArrayMethodLabel(method)} executed`);
        },
    });
    let result;
    let error;
    try {
        result = await action();
    }
    catch (caught) {
        error = caught;
    }
    finally {
        Object.defineProperty(Array.prototype, method, original);
    }
    return {
        calls,
        ...(result === undefined ? {} : { result }),
        ...(error === undefined ? {} : { error }),
    };
}
(0, node_test_1.describe)("P10.1C adversarial current-ref boundaries", () => {
    (0, node_test_1.it)("does not invoke poisoned filter, slice, at, find, or join across current-ref-only boundaries", async () => {
        const cases = [
            {
                method: "filter",
                run: async () => {
                    await withStores(async ({ currentRoot, runRoot }) => {
                        const generationsRoot = node_path_1.default.join(currentRoot, "generations");
                        for (let index = 0; index < 257; index += 1) {
                            await (0, promises_1.writeFile)(node_path_1.default.join(generationsRoot, `unknown-${index.toString().padStart(3, "0")}`), "", { mode: 0o600 });
                        }
                        const outcome = await withPoisonedArrayMethod("filter", () => (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot));
                        node_assert_1.default.strictEqual(outcome.calls, 0);
                        node_assert_1.default.strictEqual(outcome.error, undefined);
                        node_assert_1.default.ok(outcome.result);
                        node_assert_1.default.strictEqual(outcome.result.status, "degraded");
                        node_assert_1.default.strictEqual(outcome.result.fault?.code, "generation_limit");
                        node_assert_1.default.strictEqual(outcome.result.unknownGenerationNames.length, 256);
                        node_assert_1.default.strictEqual(outcome.result.unknownGenerationNames[0], "unknown-000");
                        node_assert_1.default.ok(outcome.result.unknownGenerationNames.includes("unknown-255"));
                        node_assert_1.default.ok(!outcome.result.unknownGenerationNames.includes("unknown-256"));
                    });
                },
            },
            {
                method: "slice",
                run: async () => {
                    await withStores(async ({ currentRoot, runRoot }) => {
                        const fixture = genesisCompleteFixture("poisoned-slice-exact-retry");
                        await materializeFixture(runRoot, fixture);
                        const first = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                            currentRoot,
                            runRoot,
                            bundleId: fixture.prepared.bundleId,
                            expectedGeneration: ZERO_GENERATION,
                        });
                        const outcome = await withPoisonedArrayMethod("slice", () => (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                            currentRoot,
                            runRoot,
                            bundleId: fixture.prepared.bundleId,
                            expectedGeneration: ZERO_GENERATION,
                        }));
                        node_assert_1.default.strictEqual(outcome.calls, 0);
                        node_assert_1.default.ok(outcome.error instanceof refresh_current_ref_js_1.TaskMapRefreshCurrentError);
                        node_assert_1.default.strictEqual(outcome.error.code, "invalid_contract");
                        node_assert_1.default.strictEqual(outcome.error.committed, false);
                        const retry = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                            currentRoot,
                            runRoot,
                            bundleId: fixture.prepared.bundleId,
                            expectedGeneration: ZERO_GENERATION,
                        });
                        node_assert_1.default.strictEqual(retry.status, "already_current");
                        node_assert_1.default.strictEqual(retry.ref.refId, first.ref.refId);
                    });
                },
            },
            {
                method: "at",
                run: async () => {
                    await withStores(async ({ currentRoot, runRoot }) => {
                        const outcome = await withPoisonedArrayMethod("at", () => (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot));
                        node_assert_1.default.strictEqual(outcome.calls, 0);
                        node_assert_1.default.strictEqual(outcome.error, undefined);
                        node_assert_1.default.ok(outcome.result);
                        node_assert_1.default.strictEqual(outcome.result.status, "empty");
                    });
                },
            },
            {
                method: "find",
                run: async () => {
                    await withStores(async ({ currentRoot, runRoot }) => {
                        const fixture = genesisCompleteFixture("poisoned-find-recovery");
                        await materializeFixture(runRoot, fixture);
                        const interrupted = await expectCurrentError((0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                            currentRoot,
                            runRoot,
                            bundleId: fixture.prepared.bundleId,
                            expectedGeneration: ZERO_GENERATION,
                            options: {
                                operationToken: PRIMARY_OPERATION_TOKEN,
                                faultInjection(point) {
                                    if (point === "after_object_partial_write") {
                                        throw new Error("seed a partial object for find recovery");
                                    }
                                },
                            },
                        }), "write_failed");
                        const receipt = interrupted.recoveryReceipt;
                        node_assert_1.default.ok(receipt);
                        const outcome = await withPoisonedArrayMethod("find", () => (0, refresh_current_ref_js_1.recoverTaskMapRefreshCurrentResidue)(currentRoot, runRoot, receipt));
                        node_assert_1.default.strictEqual(outcome.calls, 0);
                        node_assert_1.default.strictEqual(outcome.error, undefined);
                        node_assert_1.default.strictEqual(outcome.result, "recovered");
                        const completed = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                            currentRoot,
                            runRoot,
                            bundleId: fixture.prepared.bundleId,
                            expectedGeneration: ZERO_GENERATION,
                            options: { operationToken: RETRY_OPERATION_TOKEN },
                        });
                        node_assert_1.default.strictEqual(completed.status, "published");
                    });
                },
            },
            {
                method: "join",
                run: async () => {
                    await withStores(async ({ currentRoot, runRoot }) => {
                        const fixture = genesisCompleteFixture("poisoned-join-current-ref-assertion");
                        await materializeFixture(runRoot, fixture);
                        const first = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                            currentRoot,
                            runRoot,
                            bundleId: fixture.prepared.bundleId,
                            expectedGeneration: ZERO_GENERATION,
                        });
                        const claim = await readReservationClaim(currentRoot);
                        const generationBefore = await captureFile(node_path_1.default.join(currentRoot, "generations", `${FIRST_GENERATION}.ref`));
                        const objectBefore = await captureFile(node_path_1.default.join(currentRoot, "objects", claim.objectName));
                        const outcome = await withPoisonedArrayMethod("join", async () => (0, refresh_current_ref_js_1.assertTaskMapRefreshCurrentRef)(first.ref));
                        node_assert_1.default.strictEqual(outcome.calls, 0);
                        node_assert_1.default.ok(outcome.error instanceof refresh_current_ref_js_1.TaskMapRefreshCurrentError);
                        node_assert_1.default.strictEqual(outcome.error.code, "invalid_contract");
                        node_assert_1.default.strictEqual(outcome.error.committed, false);
                        await Promise.all([
                            assertFilePreserved(generationBefore),
                            assertFilePreserved(objectBefore),
                        ]);
                        const healthy = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
                        node_assert_1.default.strictEqual(healthy.status, "healthy");
                        node_assert_1.default.strictEqual(healthy.head?.refId, first.ref.refId);
                    });
                },
            },
        ];
        for (let index = 0; index < cases.length; index += 1) {
            await cases[index].run();
        }
    });
    (0, node_test_1.it)("fails closed before transitive bundle verification under poisoned some without rollback residue", async () => {
        await withStores(async ({ parent, currentRoot, runRoot }) => {
            const fixture = genesisCompleteFixture("poisoned-some-rollback-verifier-guard");
            await materializeFixture(runRoot, fixture);
            const first = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: fixture.prepared.bundleId,
                expectedGeneration: ZERO_GENERATION,
            });
            const claim = await readReservationClaim(currentRoot);
            const generationPath = node_path_1.default.join(currentRoot, "generations", `${FIRST_GENERATION}.ref`);
            const objectPath = node_path_1.default.join(currentRoot, "objects", claim.objectName);
            const [generationBefore, objectBefore] = await Promise.all([
                captureFile(generationPath),
                captureFile(objectPath),
            ]);
            const reservationNamesBefore = await reservationEntries(currentRoot);
            const reservationTargetsBefore = await Promise.all(reservationNamesBefore.map((name) => (0, promises_1.readlink)(node_path_1.default.join(currentRoot, "reservations", name))));
            const objectNamesBefore = await (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "objects"));
            const generationNamesBefore = await (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "generations"));
            const readOutcome = await withPoisonedArrayMethod("some", () => (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot));
            node_assert_1.default.strictEqual(readOutcome.calls, 0);
            node_assert_1.default.strictEqual(readOutcome.error, undefined);
            node_assert_1.default.ok(readOutcome.result);
            node_assert_1.default.strictEqual(readOutcome.result.status, "degraded");
            const rollbackOutcome = await withPoisonedArrayMethod("some", () => (0, refresh_current_ref_js_1.rollbackTaskMapRefreshCurrent)({
                currentRoot,
                runRoot,
                targetGeneration: FIRST_GENERATION,
                expectedGeneration: FIRST_GENERATION,
                expectedRefId: first.ref.refId,
            }));
            node_assert_1.default.strictEqual(rollbackOutcome.calls, 0);
            node_assert_1.default.ok(rollbackOutcome.error instanceof refresh_current_ref_js_1.TaskMapRefreshCurrentError);
            node_assert_1.default.strictEqual(rollbackOutcome.error.code, "degraded");
            node_assert_1.default.strictEqual(rollbackOutcome.error.committed, false);
            node_assert_1.default.deepStrictEqual(await reservationEntries(currentRoot), reservationNamesBefore);
            node_assert_1.default.deepStrictEqual(await Promise.all(reservationNamesBefore.map((name) => (0, promises_1.readlink)(node_path_1.default.join(currentRoot, "reservations", name)))), reservationTargetsBefore);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "objects")), objectNamesBefore);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "generations")), generationNamesBefore);
            await Promise.all([
                assertFilePreserved(generationBefore),
                assertFilePreserved(objectBefore),
            ]);
            const healthy = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
            node_assert_1.default.strictEqual(healthy.status, "healthy");
            node_assert_1.default.strictEqual(healthy.head?.refId, first.ref.refId);
            const rollback = await (0, refresh_current_ref_js_1.rollbackTaskMapRefreshCurrent)({
                currentRoot,
                runRoot,
                targetGeneration: FIRST_GENERATION,
                expectedGeneration: FIRST_GENERATION,
                expectedRefId: first.ref.refId,
            });
            node_assert_1.default.strictEqual(rollback.status, "published");
            node_assert_1.default.strictEqual(rollback.ref.operation, "rollback");
            node_assert_1.default.strictEqual(rollback.ref.generation, SECOND_GENERATION);
        });
    });
    (0, node_test_1.it)("rejects every polluted frozen-bundle array dependency before publication without invoking it", async () => {
        const dependencies = [
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
                const fixture = genesisCompleteFixture(`poisoned-${poisonableArrayMethodLabel(method)}-publication-guard`);
                await materializeFixture(runRoot, fixture);
                const outcome = await withPoisonedArrayMethod(method, () => (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                    currentRoot,
                    runRoot,
                    bundleId: fixture.prepared.bundleId,
                    expectedGeneration: ZERO_GENERATION,
                }));
                node_assert_1.default.strictEqual(outcome.calls, 0, `Array.prototype.${poisonableArrayMethodLabel(method)} was invoked`);
                node_assert_1.default.ok(outcome.error instanceof refresh_current_ref_js_1.TaskMapRefreshCurrentError);
                node_assert_1.default.strictEqual(outcome.error.code, "invalid_contract");
                node_assert_1.default.strictEqual(outcome.error.committed, false);
                node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "reservations")), []);
                node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "objects")), []);
                node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "generations")), []);
                const published = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                    currentRoot,
                    runRoot,
                    bundleId: fixture.prepared.bundleId,
                    expectedGeneration: ZERO_GENERATION,
                });
                node_assert_1.default.strictEqual(published.status, "published");
                node_assert_1.default.strictEqual(published.ref.generation, FIRST_GENERATION);
            });
        }
    });
    (0, node_test_1.it)("bounds generation listings, aggregate history bytes, and generation zero", async () => {
        await withStores(async ({ currentRoot, runRoot }) => {
            const generationRoot = node_path_1.default.join(currentRoot, "generations");
            const names = Array.from({ length: 257 }, (_, index) => `unrelated-${index.toString().padStart(3, "0")}.bin`);
            await Promise.all(names.slice(0, 256).map(async (name, index) => {
                await (0, promises_1.writeFile)(node_path_1.default.join(generationRoot, name), Buffer.from(`unknown-generation:${index}`, "utf8"), { mode: 0o600 });
            }));
            const firstFiles = await Promise.all(names.slice(0, 256).map((name) => (captureFile(node_path_1.default.join(generationRoot, name)))));
            const exactLimit = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
            node_assert_1.default.strictEqual(exactLimit.status, "empty");
            node_assert_1.default.strictEqual(exactLimit.fault, undefined);
            node_assert_1.default.deepStrictEqual(exactLimit.unknownGenerationNames, names.slice(0, 256));
            await Promise.all(firstFiles.map(assertFilePreserved));
            await (0, promises_1.writeFile)(node_path_1.default.join(generationRoot, names[256]), Buffer.from("unknown-generation:256", "utf8"), { mode: 0o600 });
            const allFiles = await Promise.all(names.map((name) => captureFile(node_path_1.default.join(generationRoot, name))));
            const overflow = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
            node_assert_1.default.strictEqual(overflow.status, "degraded");
            node_assert_1.default.strictEqual(overflow.fault?.code, "generation_limit");
            node_assert_1.default.strictEqual(overflow.unknownGenerationNames.length, 256);
            node_assert_1.default.deepStrictEqual(overflow.unknownGenerationNames, names.slice(0, 256));
            await Promise.all(allFiles.map(assertFilePreserved));
        });
        await withStores(async ({ currentRoot, runRoot }) => {
            const zeroPath = node_path_1.default.join(currentRoot, "generations", `${ZERO_GENERATION}.ref`);
            await (0, promises_1.writeFile)(zeroPath, "generation-zero-sentinel", {
                mode: 0o600,
            });
            const zeroBefore = await captureFile(zeroPath);
            const snapshot = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
            node_assert_1.default.strictEqual(snapshot.status, "degraded");
            node_assert_1.default.strictEqual(snapshot.generations.length, 0);
            node_assert_1.default.strictEqual(snapshot.fault?.generation, ZERO_GENERATION);
            node_assert_1.default.strictEqual(snapshot.fault?.code, "generation_corrupt");
            node_assert_1.default.deepStrictEqual(snapshot.unknownGenerationNames, []);
            await assertFilePreserved(zeroBefore);
        });
        await withStores(async ({ currentRoot, runRoot }) => {
            const generationRoot = node_path_1.default.join(currentRoot, "generations");
            const fullRefBytes = Buffer.alloc(refresh_current_ref_js_1.TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxRefBytes, 0x20);
            const generationNames = [];
            for (let index = 1; index <= 65; index += 1) {
                generationNames[generationNames.length] =
                    `${index.toString().padStart(20, "0")}.ref`;
            }
            for (let index = 0; index < 64; index += 1) {
                await (0, promises_1.writeFile)(node_path_1.default.join(generationRoot, generationNames[index]), fullRefBytes, { mode: 0o600 });
            }
            const firstBefore = await captureFile(node_path_1.default.join(generationRoot, generationNames[0]));
            const exactAggregateLimit = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
            node_assert_1.default.strictEqual(exactAggregateLimit.status, "degraded");
            node_assert_1.default.strictEqual(exactAggregateLimit.fault?.code, "generation_corrupt");
            await (0, promises_1.writeFile)(node_path_1.default.join(generationRoot, generationNames[64]), fullRefBytes, { mode: 0o600 });
            const lastBefore = await captureFile(node_path_1.default.join(generationRoot, generationNames[64]));
            const aggregateOverflow = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
            node_assert_1.default.strictEqual(aggregateOverflow.status, "degraded");
            node_assert_1.default.strictEqual(aggregateOverflow.fault?.code, "generation_limit");
            node_assert_1.default.strictEqual(aggregateOverflow.fault?.generation, generationNames[64].slice(0, -4));
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(generationRoot), generationNames);
            await Promise.all([
                assertFilePreserved(firstBefore),
                assertFilePreserved(lastBefore),
            ]);
        });
    });
    (0, node_test_1.it)("refuses a prospective history-byte overflow before creating residue", async () => {
        await withStores(async ({ currentRoot, runRoot }) => {
            const bindings = Array.from({ length: 64 }, (_, index) => ({
                connectionId: `synthetic-cap-connection-${index}`,
                sourceKind: "strategy",
                tenantOrWorkspaceDigest: digest(`cap-workspace-${index}`),
                accountOrPrincipalDigest: digest(`cap-principal-${index}`),
                grantVersion: "synthetic-read-v1",
            }));
            const snapshot = semanticSourceSnapshot(bindings.map((binding, index) => ({
                binding,
                sourceObjectId: `synthetic-cap-object-${index}`,
                sourceRevision: "cap-r1",
                contentDigest: digest(`cap-content-${index}`),
                eventTime: "2026-07-28T16:00:00.000Z",
            })));
            const checkpoints = bindings.map((binding, index) => (semanticSuccessfulCheckpoint(null, snapshot, binding, `cap-checkpoint-${index}`, "2026-07-28T16:10:00.000Z")));
            const fixture = semanticPublicationFixture({
                label: "history-cap-g1",
                snapshot,
                attemptCheckpoints: checkpoints,
                publicationState: "complete",
            });
            await materializeFixture(runRoot, fixture);
            const first = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: fixture.prepared.bundleId,
                expectedGeneration: ZERO_GENERATION,
            });
            const firstBytes = Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(first.ref), "utf8");
            node_assert_1.default.ok(firstBytes > 32 * 1024);
            node_assert_1.default.ok(firstBytes <= refresh_current_ref_js_1.TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxRefBytes);
            const seeded = [];
            let aggregateBytes = firstBytes;
            let previous = first.ref;
            let candidate;
            for (let generationNumber = 2; generationNumber <= refresh_current_ref_js_1.TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxGenerations; generationNumber += 1) {
                const next = syntheticRollbackRef(previous, first.ref, generationNumber);
                const nextBytes = Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(next), "utf8");
                if (aggregateBytes + nextBytes
                    > refresh_current_ref_js_1.TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxHistoryBytes) {
                    candidate = next;
                    break;
                }
                seeded.push(next);
                aggregateBytes += nextBytes;
                previous = next;
            }
            node_assert_1.default.ok(candidate);
            node_assert_1.default.ok(seeded.length > 0);
            node_assert_1.default.ok(aggregateBytes
                <= refresh_current_ref_js_1.TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxHistoryBytes);
            node_assert_1.default.ok(aggregateBytes
                + Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(candidate), "utf8")
                > refresh_current_ref_js_1.TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxHistoryBytes);
            for (let offset = 0; offset < seeded.length; offset += 16) {
                await Promise.all(seeded.slice(offset, offset + 16).map((ref) => (seedSyntheticRollbackRef(currentRoot, ref))));
            }
            const beforeSnapshot = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
            node_assert_1.default.strictEqual(beforeSnapshot.status, "healthy");
            node_assert_1.default.strictEqual(beforeSnapshot.head?.refId, previous.refId);
            const beforeListings = await Promise.all([
                (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "generations")),
                (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "objects")),
                (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "reservations")),
            ]);
            const error = await expectCurrentError((0, refresh_current_ref_js_1.rollbackTaskMapRefreshCurrent)({
                currentRoot,
                runRoot,
                targetGeneration: FIRST_GENERATION,
                expectedGeneration: previous.generation,
                expectedRefId: previous.refId,
            }), "resource_limit");
            node_assert_1.default.strictEqual(error.committed, false);
            node_assert_1.default.strictEqual(error.recoveryReceipt, undefined);
            const afterListings = await Promise.all([
                (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "generations")),
                (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "objects")),
                (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "reservations")),
            ]);
            for (let index = 0; index < beforeListings.length; index += 1) {
                node_assert_1.default.deepStrictEqual(afterListings[index].sort(), beforeListings[index].sort());
            }
            node_assert_1.default.ok(!afterListings[0].includes(`${candidate.generation}.ref`));
            node_assert_1.default.ok(!afterListings[2].includes(`${candidate.generation}.claim`));
            node_assert_1.default.ok(!afterListings[2].includes(`${candidate.generation}.identity`));
            const reopened = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
            node_assert_1.default.strictEqual(reopened.status, "healthy");
            node_assert_1.default.strictEqual(reopened.head?.refId, previous.refId);
        });
    });
    (0, node_test_1.it)("refuses a prospective frozen-bundle budget overflow without residue", async () => {
        await withStores(async ({ currentRoot, runRoot }) => {
            const fixtures = [];
            let acceptedOrigin;
            let previousCheckpoint = null;
            for (let index = 1; index <= 5; index += 1) {
                const snapshot = semanticSourceSnapshot([{
                        binding: BINDING,
                        sourceObjectId: "bundle-budget-object",
                        sourceRevision: `bundle-budget-r${index}`,
                        contentDigest: digest(`bundle-budget-c${index}`),
                        eventTime: `2026-07-28T${(10 + index).toString().padStart(2, "0")}:00:00.000Z`,
                    }]);
                const checkpoint = semanticSuccessfulCheckpoint(previousCheckpoint, snapshot, BINDING, `bundle-budget-${index}`, `2026-07-28T${(10 + index).toString().padStart(2, "0")}:10:00.000Z`);
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
            await Promise.all(fixtures.map((fixture) => materializeFixture(runRoot, fixture)));
            const runtime = refreshRunBundleRuntime;
            const originalVerifier = runtime.verifyTaskMapRefreshRunBundle;
            runtime.verifyTaskMapRefreshRunBundle = async (...args) => {
                const verified = await originalVerifier(...args);
                node_assert_1.default.strictEqual(verified.manifest.members.length, 4);
                return {
                    ...verified,
                    manifest: {
                        ...verified.manifest,
                        members: verified.manifest.members.map((member) => ({
                            ...member,
                            byteLength: 3_900_000,
                        })),
                    },
                };
            };
            try {
                let expectedGeneration = ZERO_GENERATION;
                let expectedRefId;
                for (let index = 0; index < 4; index += 1) {
                    const published = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
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
                    const healthy = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
                    node_assert_1.default.strictEqual(healthy.status, "healthy");
                    node_assert_1.default.strictEqual(healthy.head?.refId, expectedRefId);
                }
                const beforeListings = await Promise.all([
                    (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "generations")),
                    (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "objects")),
                    (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "reservations")),
                ]);
                const error = await expectCurrentError((0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                    currentRoot,
                    runRoot,
                    bundleId: fixtures[4].prepared.bundleId,
                    expectedGeneration,
                    expectedRefId,
                }), "resource_limit");
                node_assert_1.default.strictEqual(error.committed, false);
                node_assert_1.default.strictEqual(error.recoveryReceipt, undefined);
                const afterListings = await Promise.all([
                    (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "generations")),
                    (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "objects")),
                    (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "reservations")),
                ]);
                for (let index = 0; index < beforeListings.length; index += 1) {
                    node_assert_1.default.deepStrictEqual(afterListings[index].sort(), beforeListings[index].sort());
                }
                node_assert_1.default.strictEqual(afterListings[0].length, 4);
            }
            finally {
                runtime.verifyTaskMapRefreshRunBundle = originalVerifier;
            }
            const reopened = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
            node_assert_1.default.strictEqual(reopened.status, "healthy");
            node_assert_1.default.strictEqual(reopened.generations.length, 4);
        });
    });
    (0, node_test_1.it)("rejects inherited and accessor command fields without invoking getters", async () => {
        await withStores(async ({ currentRoot, runRoot }) => {
            const fixture = genesisCompleteFixture("descriptor-command");
            let publishInheritedReads = 0;
            const inheritedPublish = Object.create({
                get bundleId() {
                    publishInheritedReads += 1;
                    throw new Error("inherited publish field executed");
                },
            });
            Object.assign(inheritedPublish, {
                currentRoot,
                runRoot,
                expectedGeneration: ZERO_GENERATION,
            });
            await expectCurrentError((0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)(inheritedPublish), "invalid_contract");
            node_assert_1.default.strictEqual(publishInheritedReads, 0);
            let publishAccessorReads = 0;
            const accessorPublish = {
                currentRoot,
                runRoot,
                expectedGeneration: ZERO_GENERATION,
            };
            Object.defineProperty(accessorPublish, "bundleId", {
                configurable: true,
                enumerable: true,
                get() {
                    publishAccessorReads += 1;
                    throw new Error("publish accessor executed");
                },
            });
            await expectCurrentError((0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)(accessorPublish), "invalid_contract");
            node_assert_1.default.strictEqual(publishAccessorReads, 0);
            let rollbackInheritedReads = 0;
            const inheritedRollback = Object.create({
                get expectedRefId() {
                    rollbackInheritedReads += 1;
                    throw new Error("inherited rollback field executed");
                },
            });
            Object.assign(inheritedRollback, {
                currentRoot,
                runRoot,
                targetGeneration: FIRST_GENERATION,
                expectedGeneration: FIRST_GENERATION,
            });
            await expectCurrentError((0, refresh_current_ref_js_1.rollbackTaskMapRefreshCurrent)(inheritedRollback), "invalid_contract");
            node_assert_1.default.strictEqual(rollbackInheritedReads, 0);
            let rollbackAccessorReads = 0;
            const accessorRollback = {
                currentRoot,
                runRoot,
                targetGeneration: FIRST_GENERATION,
                expectedGeneration: FIRST_GENERATION,
            };
            Object.defineProperty(accessorRollback, "expectedRefId", {
                configurable: true,
                enumerable: true,
                get() {
                    rollbackAccessorReads += 1;
                    throw new Error("rollback accessor executed");
                },
            });
            await expectCurrentError((0, refresh_current_ref_js_1.rollbackTaskMapRefreshCurrent)(accessorRollback), "invalid_contract");
            node_assert_1.default.strictEqual(rollbackAccessorReads, 0);
            let inheritedOptionsReads = 0;
            const originalOptionsDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, "options");
            Object.defineProperty(Object.prototype, "options", {
                configurable: true,
                get() {
                    inheritedOptionsReads += 1;
                    throw new Error("Object.prototype.options executed");
                },
            });
            let poisonedPublish;
            try {
                poisonedPublish = (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                    currentRoot,
                    runRoot,
                    bundleId: fixture.prepared.bundleId,
                    expectedGeneration: ZERO_GENERATION,
                });
            }
            finally {
                if (originalOptionsDescriptor === undefined) {
                    Reflect.deleteProperty(Object.prototype, "options");
                }
                else {
                    Object.defineProperty(Object.prototype, "options", originalOptionsDescriptor);
                }
            }
            await expectCurrentError(poisonedPublish, "invalid_contract");
            node_assert_1.default.strictEqual(inheritedOptionsReads, 0);
        });
    });
    (0, node_test_1.it)("snapshots proxy-backed publish and rollback commands without property gets", async () => {
        await withStores(async ({ currentRoot, runRoot }) => {
            const fixture = genesisCompleteFixture("proxy-command");
            await materializeFixture(runRoot, fixture);
            let getTrapReads = 0;
            const publishOptions = new Proxy({ operationToken: PRIMARY_OPERATION_TOKEN }, {
                get() {
                    getTrapReads += 1;
                    throw new Error("publish options get trap executed");
                },
            });
            const publishCommand = new Proxy({
                currentRoot,
                runRoot,
                bundleId: fixture.prepared.bundleId,
                expectedGeneration: ZERO_GENERATION,
                options: publishOptions,
            }, {
                get() {
                    getTrapReads += 1;
                    throw new Error("publish command get trap executed");
                },
            });
            const first = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)(publishCommand);
            const rollbackOptions = new Proxy({ operationToken: RETRY_OPERATION_TOKEN }, {
                get() {
                    getTrapReads += 1;
                    throw new Error("rollback options get trap executed");
                },
            });
            const rollbackCommand = new Proxy({
                currentRoot,
                runRoot,
                targetGeneration: FIRST_GENERATION,
                expectedGeneration: FIRST_GENERATION,
                expectedRefId: first.ref.refId,
                options: rollbackOptions,
            }, {
                get() {
                    getTrapReads += 1;
                    throw new Error("rollback command get trap executed");
                },
            });
            const second = await (0, refresh_current_ref_js_1.rollbackTaskMapRefreshCurrent)(rollbackCommand);
            node_assert_1.default.strictEqual(second.ref.generation, SECOND_GENERATION);
            node_assert_1.default.strictEqual(second.ref.rollback?.targetGeneration, FIRST_GENERATION);
            node_assert_1.default.strictEqual((await readReservationClaim(currentRoot)).operationToken, PRIMARY_OPERATION_TOKEN);
            node_assert_1.default.strictEqual((await readReservationClaim(currentRoot, SECOND_GENERATION)).operationToken, RETRY_OPERATION_TOKEN);
            node_assert_1.default.strictEqual(getTrapReads, 0);
        });
    });
    (0, node_test_1.it)("uses original plain command and option values after queued mutation", async () => {
        await withStores(async ({ parent, currentRoot, runRoot }) => {
            const fixture = genesisCompleteFixture("queued-mutation");
            await materializeFixture(runRoot, fixture);
            const publishOptions = { operationToken: PRIMARY_OPERATION_TOKEN };
            const publishCommand = {
                currentRoot,
                runRoot,
                bundleId: fixture.prepared.bundleId,
                expectedGeneration: ZERO_GENERATION,
                options: publishOptions,
            };
            const publishPromise = (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)(publishCommand);
            queueMicrotask(() => {
                publishCommand.currentRoot = node_path_1.default.join(parent, "mutated-current");
                publishCommand.runRoot = node_path_1.default.join(parent, "mutated-runs");
                publishCommand.bundleId =
                    `tmrefreshrun_${digest("mutated-publish-bundle")}`;
                publishCommand.expectedGeneration = FIRST_GENERATION;
                publishOptions.operationToken = RETRY_OPERATION_TOKEN;
                publishOptions.faultInjection = () => {
                    throw new Error("mutated publish options executed");
                };
            });
            const first = await publishPromise;
            node_assert_1.default.strictEqual(first.ref.generation, FIRST_GENERATION);
            node_assert_1.default.strictEqual((await readReservationClaim(currentRoot)).operationToken, PRIMARY_OPERATION_TOKEN);
            const rollbackOptions = { operationToken: RETRY_OPERATION_TOKEN };
            const rollbackCommand = {
                currentRoot,
                runRoot,
                targetGeneration: FIRST_GENERATION,
                expectedGeneration: FIRST_GENERATION,
                expectedRefId: first.ref.refId,
                options: rollbackOptions,
            };
            const rollbackPromise = (0, refresh_current_ref_js_1.rollbackTaskMapRefreshCurrent)(rollbackCommand);
            queueMicrotask(() => {
                rollbackCommand.currentRoot = node_path_1.default.join(parent, "mutated-rollback-current");
                rollbackCommand.runRoot = node_path_1.default.join(parent, "mutated-rollback-runs");
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
            node_assert_1.default.strictEqual(second.ref.generation, SECOND_GENERATION);
            node_assert_1.default.strictEqual(second.ref.rollback?.targetGeneration, FIRST_GENERATION);
            node_assert_1.default.strictEqual((await readReservationClaim(currentRoot, SECOND_GENERATION)).operationToken, RETRY_OPERATION_TOKEN);
        });
    });
    (0, node_test_1.it)("rejects prototype optionals and hostile connector-head arrays without executing them", async () => {
        await withStores(async ({ currentRoot, runRoot }) => {
            const fixture = genesisCompleteFixture("assert-descriptors");
            await materializeFixture(runRoot, fixture);
            const published = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
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
            ]) {
                const candidate = cloneCurrentRef(published.ref);
                Reflect.deleteProperty(candidate, key);
                let getterReads = 0;
                const original = Object.getOwnPropertyDescriptor(Object.prototype, key);
                Object.defineProperty(Object.prototype, key, {
                    configurable: true,
                    get() {
                        getterReads += 1;
                        throw new Error(`Object.prototype.${key} executed`);
                    },
                });
                let caught;
                try {
                    (0, refresh_current_ref_js_1.assertTaskMapRefreshCurrentRef)(candidate);
                }
                catch (error) {
                    caught = error;
                }
                finally {
                    if (original === undefined) {
                        Reflect.deleteProperty(Object.prototype, key);
                    }
                    else {
                        Object.defineProperty(Object.prototype, key, original);
                    }
                }
                node_assert_1.default.ok(caught instanceof refresh_current_ref_js_1.TaskMapRefreshCurrentError);
                node_assert_1.default.strictEqual(caught.code, "invalid_contract");
                node_assert_1.default.strictEqual(getterReads, 0);
            }
            const inheritedLastGood = cloneCurrentRef(published.ref);
            Reflect.deleteProperty(inheritedLastGood.connectorHeads[0], "lastGood");
            let lastGoodReads = 0;
            const originalLastGood = Object.getOwnPropertyDescriptor(Object.prototype, "lastGood");
            Object.defineProperty(Object.prototype, "lastGood", {
                configurable: true,
                get() {
                    lastGoodReads += 1;
                    throw new Error("Object.prototype.lastGood executed");
                },
            });
            let lastGoodError;
            try {
                (0, refresh_current_ref_js_1.assertTaskMapRefreshCurrentRef)(inheritedLastGood);
            }
            catch (error) {
                lastGoodError = error;
            }
            finally {
                if (originalLastGood === undefined) {
                    Reflect.deleteProperty(Object.prototype, "lastGood");
                }
                else {
                    Object.defineProperty(Object.prototype, "lastGood", originalLastGood);
                }
            }
            node_assert_1.default.ok(lastGoodError instanceof refresh_current_ref_js_1.TaskMapRefreshCurrentError);
            node_assert_1.default.strictEqual(lastGoodError.code, "invalid_contract");
            node_assert_1.default.strictEqual(lastGoodReads, 0);
            const iteratorCandidate = cloneCurrentRef(published.ref);
            const originalIterator = Object.getOwnPropertyDescriptor(Array.prototype, Symbol.iterator);
            let iteratorCalls = 0;
            Object.defineProperty(Array.prototype, Symbol.iterator, {
                ...originalIterator,
                value() {
                    iteratorCalls += 1;
                    throw new Error("poisoned Array.prototype iterator executed");
                },
            });
            let iteratorError;
            try {
                (0, refresh_current_ref_js_1.assertTaskMapRefreshCurrentRef)(iteratorCandidate);
            }
            catch (error) {
                iteratorError = error;
            }
            finally {
                Object.defineProperty(Array.prototype, Symbol.iterator, originalIterator);
            }
            node_assert_1.default.ok(iteratorError instanceof refresh_current_ref_js_1.TaskMapRefreshCurrentError, `unexpected iterator rejection: ${iteratorError instanceof Error
                ? iteratorError.stack
                    ?? `${iteratorError.name}: ${iteratorError.message}`
                : String(iteratorError)}; iterator calls=${iteratorCalls}`);
            node_assert_1.default.strictEqual(iteratorError.code, "invalid_contract");
            node_assert_1.default.strictEqual(iteratorCalls, 0);
            const sparseCandidate = cloneCurrentRef(published.ref);
            sparseCandidate.connectorHeads =
                new Array(1);
            expectSynchronousCurrentError(() => (0, refresh_current_ref_js_1.assertTaskMapRefreshCurrentRef)(sparseCandidate), "invalid_contract");
            const accessorCandidate = cloneCurrentRef(published.ref);
            let connectorGetterReads = 0;
            const accessorHeads = [];
            Object.defineProperty(accessorHeads, "0", {
                configurable: true,
                enumerable: true,
                get() {
                    connectorGetterReads += 1;
                    throw new Error("connectorHeads[0] accessor executed");
                },
            });
            accessorCandidate.connectorHeads = accessorHeads;
            expectSynchronousCurrentError(() => (0, refresh_current_ref_js_1.assertTaskMapRefreshCurrentRef)(accessorCandidate), "invalid_contract");
            node_assert_1.default.strictEqual(connectorGetterReads, 0);
        });
    });
    (0, node_test_1.it)("degrades when two connector heads are reversed on disk without changing refId", async () => {
        await withStores(async ({ currentRoot, runRoot }) => {
            const firstFixture = genesisCompleteFixture("reversed-head-genesis");
            const upgrade = adapterUpgradeFixture(firstFixture);
            await materializeFixture(runRoot, firstFixture);
            await materializeFixture(runRoot, upgrade);
            const first = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: firstFixture.prepared.bundleId,
                expectedGeneration: ZERO_GENERATION,
            });
            const second = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: upgrade.prepared.bundleId,
                expectedGeneration: FIRST_GENERATION,
                expectedRefId: first.ref.refId,
            });
            node_assert_1.default.strictEqual(second.ref.connectorHeads.length, 2);
            const generationPath = node_path_1.default.join(currentRoot, "generations", `${SECOND_GENERATION}.ref`);
            const claim = await readReservationClaim(currentRoot, SECOND_GENERATION);
            const objectPath = node_path_1.default.join(currentRoot, "objects", claim.objectName);
            const inodeBefore = await (0, promises_1.lstat)(generationPath, { bigint: true });
            const stored = JSON.parse(await (0, promises_1.readFile)(generationPath, "utf8"));
            const originalRefId = stored.refId;
            stored.connectorHeads.reverse();
            node_assert_1.default.strictEqual(stored.refId, originalRefId);
            const reversedBytes = (0, source_contracts_js_1.taskMapContractCanonicalJson)(stored);
            await (0, promises_1.writeFile)(generationPath, reversedBytes);
            const generationAfter = await (0, promises_1.lstat)(generationPath, { bigint: true });
            const objectAfter = await (0, promises_1.lstat)(objectPath, { bigint: true });
            node_assert_1.default.strictEqual(generationAfter.dev, inodeBefore.dev);
            node_assert_1.default.strictEqual(generationAfter.ino, inodeBefore.ino);
            node_assert_1.default.strictEqual(objectAfter.dev, inodeBefore.dev);
            node_assert_1.default.strictEqual(objectAfter.ino, inodeBefore.ino);
            node_assert_1.default.strictEqual(await (0, promises_1.readFile)(objectPath, "utf8"), reversedBytes);
            const degraded = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
            node_assert_1.default.strictEqual(degraded.status, "degraded");
            node_assert_1.default.strictEqual(degraded.head?.refId, first.ref.refId);
            node_assert_1.default.strictEqual(degraded.generations.length, 1);
            node_assert_1.default.strictEqual(degraded.fault?.generation, SECOND_GENERATION);
            node_assert_1.default.strictEqual(degraded.fault?.code, "generation_corrupt");
        });
    });
    (0, node_test_1.it)("refuses an unknown pre-write hardlink without touching either peer", async () => {
        await withStores(async ({ parent, currentRoot, runRoot }) => {
            const fixture = genesisCompleteFixture("unknown-recovery-hardlink");
            await materializeFixture(runRoot, fixture);
            const interrupted = await expectCurrentError((0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
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
            }), "write_failed");
            node_assert_1.default.strictEqual(interrupted.committed, false);
            const receipt = interrupted.recoveryReceipt;
            node_assert_1.default.ok(receipt);
            const objectPath = node_path_1.default.join(currentRoot, "objects", receipt.objectName);
            const peerPath = node_path_1.default.join(parent, "unknown-hardlink-peer.bin");
            await (0, promises_1.link)(objectPath, peerPath);
            const objectBefore = await captureFile(objectPath);
            const peerBefore = await captureFile(peerPath);
            node_assert_1.default.strictEqual(objectBefore.stats.nlink, 2n);
            node_assert_1.default.strictEqual(peerBefore.stats.dev, objectBefore.stats.dev);
            node_assert_1.default.strictEqual(peerBefore.stats.ino, objectBefore.stats.ino);
            const refused = await expectCurrentError((0, refresh_current_ref_js_1.recoverTaskMapRefreshCurrentResidue)(currentRoot, runRoot, receipt), "recovery_refused");
            node_assert_1.default.strictEqual(refused.committed, false);
            await assertFilePreserved(objectBefore);
            await assertFilePreserved(peerBefore);
        });
    });
    (0, node_test_1.it)("post-commit recovery retains the exact generation hardlink peer", async () => {
        await withStores(async ({ currentRoot, runRoot }) => {
            const fixture = genesisCompleteFixture("postcommit-recovery");
            await materializeFixture(runRoot, fixture);
            const interrupted = await expectCurrentError((0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
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
            }), "write_failed");
            node_assert_1.default.strictEqual(interrupted.committed, true);
            const receipt = interrupted.recoveryReceipt;
            node_assert_1.default.ok(receipt);
            node_assert_1.default.strictEqual(await (0, refresh_current_ref_js_1.recoverTaskMapRefreshCurrentResidue)(currentRoot, runRoot, receipt), "already_complete");
            const objectPath = node_path_1.default.join(currentRoot, "objects", receipt.objectName);
            const generationPath = node_path_1.default.join(currentRoot, "generations", `${FIRST_GENERATION}.ref`);
            const object = await captureFile(objectPath);
            const generation = await captureFile(generationPath);
            node_assert_1.default.strictEqual(object.stats.nlink, 2n);
            node_assert_1.default.strictEqual(generation.stats.nlink, 2n);
            node_assert_1.default.strictEqual(generation.stats.dev, object.stats.dev);
            node_assert_1.default.strictEqual(generation.stats.ino, object.stats.ino);
            node_assert_1.default.deepStrictEqual(generation.bytes, object.bytes);
            node_assert_1.default.strictEqual(object.bytes.toString("utf8"), (0, source_contracts_js_1.taskMapContractCanonicalJson)(receipt.ref));
            const snapshot = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
            node_assert_1.default.strictEqual(snapshot.status, "healthy");
            node_assert_1.default.strictEqual(snapshot.generations.length, 1);
            node_assert_1.default.strictEqual(snapshot.head?.refId, receipt.refId);
        });
    });
    (0, node_test_1.it)("preserves committed and recovery-receipt context across ordinary filesystem failures", async () => {
        await withStores(async ({ currentRoot, runRoot }) => {
            const fixture = genesisCompleteFixture("postcas-revalidation");
            await materializeFixture(runRoot, fixture);
            const generationsRoot = node_path_1.default.join(currentRoot, "generations");
            let interrupted;
            try {
                interrupted = await expectCurrentError((0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                    currentRoot,
                    runRoot,
                    bundleId: fixture.prepared.bundleId,
                    expectedGeneration: ZERO_GENERATION,
                    options: {
                        operationToken: PRIMARY_OPERATION_TOKEN,
                        async faultInjection(point) {
                            if (point === "after_generation_link") {
                                await (0, promises_1.chmod)(generationsRoot, 0o755);
                            }
                        },
                    },
                }), "unsafe_target");
            }
            finally {
                await (0, promises_1.chmod)(generationsRoot, DIRECTORY_MODE);
            }
            node_assert_1.default.ok(interrupted);
            node_assert_1.default.strictEqual(interrupted.committed, true);
            node_assert_1.default.ok(interrupted.recoveryReceipt);
            const snapshot = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
            node_assert_1.default.strictEqual(snapshot.status, "healthy");
            node_assert_1.default.strictEqual(snapshot.head?.refId, interrupted.recoveryReceipt.refId);
        });
        await withStores(async ({ parent, currentRoot, runRoot }) => {
            const fixture = genesisCompleteFixture("recovery-entry-permission-context");
            await materializeFixture(runRoot, fixture);
            const interrupted = await expectCurrentError((0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
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
            }), "write_failed");
            node_assert_1.default.strictEqual(interrupted.committed, true);
            const receipt = interrupted.recoveryReceipt;
            node_assert_1.default.ok(receipt);
            const generationBefore = await captureFile(node_path_1.default.join(currentRoot, "generations", `${FIRST_GENERATION}.ref`));
            const objectBefore = await captureFile(node_path_1.default.join(currentRoot, "objects", receipt.objectName));
            let recoveryError;
            try {
                await (0, promises_1.chmod)(currentRoot, 0o755);
                recoveryError = await expectCurrentError((0, refresh_current_ref_js_1.recoverTaskMapRefreshCurrentResidue)(currentRoot, runRoot, receipt), "invalid_root");
            }
            finally {
                await (0, promises_1.chmod)(currentRoot, DIRECTORY_MODE);
            }
            node_assert_1.default.ok(recoveryError);
            node_assert_1.default.strictEqual(recoveryError.committed, true);
            node_assert_1.default.deepStrictEqual(recoveryError.recoveryReceipt, receipt);
            const childDirectories = ["objects", "generations"];
            for (let index = 0; index < childDirectories.length; index += 1) {
                const childRoot = node_path_1.default.join(currentRoot, childDirectories[index]);
                let childModeError;
                try {
                    await (0, promises_1.chmod)(childRoot, 0o755);
                    childModeError = await expectCurrentError((0, refresh_current_ref_js_1.recoverTaskMapRefreshCurrentResidue)(currentRoot, runRoot, receipt), "invalid_root");
                }
                finally {
                    await (0, promises_1.chmod)(childRoot, DIRECTORY_MODE);
                }
                node_assert_1.default.ok(childModeError);
                node_assert_1.default.strictEqual(childModeError.committed, true);
                node_assert_1.default.deepStrictEqual(childModeError.recoveryReceipt, receipt);
            }
            let fileModeError;
            try {
                await (0, promises_1.chmod)(objectBefore.path, 0o644);
                fileModeError = await expectCurrentError((0, refresh_current_ref_js_1.recoverTaskMapRefreshCurrentResidue)(currentRoot, runRoot, receipt), "recovery_refused");
            }
            finally {
                await (0, promises_1.chmod)(objectBefore.path, 0o600);
            }
            node_assert_1.default.ok(fileModeError);
            node_assert_1.default.strictEqual(fileModeError.committed, true);
            node_assert_1.default.deepStrictEqual(fileModeError.recoveryReceipt, receipt);
            const symlinkedRoot = node_path_1.default.join(parent, "symlinked-recovery-current-root");
            await (0, promises_1.symlink)(currentRoot, symlinkedRoot);
            const symlinkError = await expectCurrentError((0, refresh_current_ref_js_1.recoverTaskMapRefreshCurrentResidue)(symlinkedRoot, runRoot, receipt), "invalid_root");
            node_assert_1.default.strictEqual(symlinkError.committed, false);
            node_assert_1.default.deepStrictEqual(symlinkError.recoveryReceipt, receipt);
            const fakeRoot = node_path_1.default.join(parent, "fake-recovery-current-root");
            const fakeObjects = node_path_1.default.join(fakeRoot, "objects");
            const fakeGenerations = node_path_1.default.join(fakeRoot, "generations");
            await (0, promises_1.mkdir)(fakeRoot, { mode: 0o755 });
            await (0, promises_1.chmod)(fakeRoot, 0o755);
            await Promise.all([
                (0, promises_1.mkdir)(fakeObjects, { mode: DIRECTORY_MODE }),
                (0, promises_1.mkdir)(fakeGenerations, { mode: DIRECTORY_MODE }),
                (0, promises_1.mkdir)(node_path_1.default.join(fakeRoot, "reservations"), {
                    mode: DIRECTORY_MODE,
                }),
            ]);
            const fakeObjectPath = node_path_1.default.join(fakeObjects, receipt.objectName);
            const fakeGenerationPath = node_path_1.default.join(fakeGenerations, `${FIRST_GENERATION}.ref`);
            await (0, promises_1.link)(objectBefore.path, fakeObjectPath);
            await (0, promises_1.link)(objectBefore.path, fakeGenerationPath);
            await (0, promises_1.unlink)(objectBefore.path);
            await (0, promises_1.unlink)(generationBefore.path);
            try {
                const fakeRootError = await expectCurrentError((0, refresh_current_ref_js_1.recoverTaskMapRefreshCurrentResidue)(fakeRoot, runRoot, receipt), "invalid_root");
                node_assert_1.default.strictEqual(fakeRootError.committed, false);
                node_assert_1.default.deepStrictEqual(fakeRootError.recoveryReceipt, receipt);
            }
            finally {
                await (0, promises_1.link)(fakeObjectPath, objectBefore.path);
                await (0, promises_1.link)(fakeObjectPath, generationBefore.path);
                await (0, promises_1.unlink)(fakeObjectPath);
                await (0, promises_1.unlink)(fakeGenerationPath);
            }
            await Promise.all([
                assertFilePreserved(generationBefore),
                assertFilePreserved(objectBefore),
            ]);
            const snapshot = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
            node_assert_1.default.strictEqual(snapshot.status, "healthy");
            node_assert_1.default.strictEqual(snapshot.head?.refId, receipt.refId);
        });
        await withStores(async ({ currentRoot, runRoot }) => {
            const fixture = genesisCompleteFixture("precas-receipt");
            await materializeFixture(runRoot, fixture);
            const objectsRoot = node_path_1.default.join(currentRoot, "objects");
            let interrupted;
            try {
                interrupted = await expectCurrentError((0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                    currentRoot,
                    runRoot,
                    bundleId: fixture.prepared.bundleId,
                    expectedGeneration: ZERO_GENERATION,
                    options: {
                        operationToken: PRIMARY_OPERATION_TOKEN,
                        async faultInjection(point) {
                            if (point === "after_object_link") {
                                await (0, promises_1.chmod)(objectsRoot, 0o755);
                            }
                        },
                    },
                }), "write_failed");
            }
            finally {
                await (0, promises_1.chmod)(objectsRoot, DIRECTORY_MODE);
            }
            node_assert_1.default.ok(interrupted);
            node_assert_1.default.strictEqual(interrupted.committed, false);
            const receipt = interrupted.recoveryReceipt;
            node_assert_1.default.ok(receipt);
            node_assert_1.default.strictEqual(receipt.operationToken, PRIMARY_OPERATION_TOKEN);
            node_assert_1.default.strictEqual(await (0, refresh_current_ref_js_1.recoverTaskMapRefreshCurrentResidue)(currentRoot, runRoot, receipt), "already_complete");
            const retry = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: fixture.prepared.bundleId,
                expectedGeneration: ZERO_GENERATION,
                options: { operationToken: PRIMARY_OPERATION_TOKEN },
            });
            node_assert_1.default.strictEqual(retry.status, "published");
            node_assert_1.default.strictEqual(retry.ref.refId, receipt.refId);
        });
    });
    (0, node_test_1.it)("preserves committed receipt context when immutable run history blocks semantic recovery", async () => {
        await withStores(async ({ currentRoot, runRoot }) => {
            const fixture = genesisCompleteFixture("committed-bundle-mode-degradation");
            await materializeFixture(runRoot, fixture);
            const interrupted = await expectCurrentError((0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: fixture.prepared.bundleId,
                expectedGeneration: ZERO_GENERATION,
                options: {
                    operationToken: PRIMARY_OPERATION_TOKEN,
                    faultInjection(point) {
                        if (point === "after_generation_link") {
                            throw new Error("retain committed receipt before semantic degradation");
                        }
                    },
                },
            }), "write_failed");
            node_assert_1.default.strictEqual(interrupted.committed, true);
            const receipt = interrupted.recoveryReceipt;
            node_assert_1.default.ok(receipt);
            const objectPath = node_path_1.default.join(currentRoot, "objects", receipt.objectName);
            const generationPath = node_path_1.default.join(currentRoot, "generations", `${FIRST_GENERATION}.ref`);
            const objectBefore = await captureFile(objectPath);
            const generationBefore = await captureFile(generationPath);
            node_assert_1.default.strictEqual(objectBefore.stats.nlink, 2n);
            node_assert_1.default.strictEqual(generationBefore.stats.nlink, 2n);
            node_assert_1.default.strictEqual(objectBefore.stats.dev, generationBefore.stats.dev);
            node_assert_1.default.strictEqual(objectBefore.stats.ino, generationBefore.stats.ino);
            node_assert_1.default.deepStrictEqual(objectBefore.bytes, generationBefore.bytes);
            const bundlePath = node_path_1.default.join(runRoot, fixture.prepared.bundleId);
            let refusal;
            try {
                await (0, promises_1.chmod)(bundlePath, 0o755);
                refusal = await expectCurrentError((0, refresh_current_ref_js_1.recoverTaskMapRefreshCurrentResidue)(currentRoot, runRoot, receipt), "recovery_refused");
            }
            finally {
                await (0, promises_1.chmod)(bundlePath, DIRECTORY_MODE);
            }
            node_assert_1.default.ok(refusal);
            node_assert_1.default.strictEqual(refusal.committed, true);
            node_assert_1.default.deepStrictEqual(refusal.recoveryReceipt, receipt);
            await assertFilePreserved(objectBefore);
            await assertFilePreserved(generationBefore);
            const reopened = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
            node_assert_1.default.strictEqual(reopened.status, "healthy");
            node_assert_1.default.strictEqual(reopened.generations.length, 1);
            node_assert_1.default.strictEqual(reopened.head?.refId, receipt.refId);
        });
    });
    (0, node_test_1.it)("preserves committed receipt context when an exact reservation journal is missing or corrupt", async () => {
        const cases = [
            {
                label: "missing-identity",
                journalName: `${FIRST_GENERATION}.identity`,
                mutate: async (journalPath) => {
                    await (0, promises_1.unlink)(journalPath);
                },
            },
            {
                label: "corrupt-claim",
                journalName: `${FIRST_GENERATION}.claim`,
                mutate: async (journalPath) => {
                    await (0, promises_1.unlink)(journalPath);
                    await (0, promises_1.symlink)("{not-a-reservation-claim", journalPath);
                },
            },
        ];
        for (let index = 0; index < cases.length; index += 1) {
            const journalCase = cases[index];
            await withStores(async ({ currentRoot, runRoot }) => {
                const fixture = genesisCompleteFixture(`committed-${journalCase.label}`);
                await materializeFixture(runRoot, fixture);
                const interrupted = await expectCurrentError((0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                    currentRoot,
                    runRoot,
                    bundleId: fixture.prepared.bundleId,
                    expectedGeneration: ZERO_GENERATION,
                    options: {
                        operationToken: PRIMARY_OPERATION_TOKEN,
                        faultInjection(point) {
                            if (point === "after_generation_link") {
                                throw new Error(`retain committed receipt before ${journalCase.label}`);
                            }
                        },
                    },
                }), "write_failed");
                node_assert_1.default.strictEqual(interrupted.committed, true);
                const receipt = interrupted.recoveryReceipt;
                node_assert_1.default.ok(receipt);
                node_assert_1.default.strictEqual(Object.getPrototypeOf(receipt), Object.prototype);
                const objectPath = node_path_1.default.join(currentRoot, "objects", receipt.objectName);
                const generationPath = node_path_1.default.join(currentRoot, "generations", `${FIRST_GENERATION}.ref`);
                const objectBefore = await captureFile(objectPath);
                const generationBefore = await captureFile(generationPath);
                node_assert_1.default.strictEqual(objectBefore.stats.nlink, 2n);
                node_assert_1.default.strictEqual(generationBefore.stats.nlink, 2n);
                node_assert_1.default.strictEqual(objectBefore.stats.dev, generationBefore.stats.dev);
                node_assert_1.default.strictEqual(objectBefore.stats.ino, generationBefore.stats.ino);
                node_assert_1.default.deepStrictEqual(objectBefore.bytes, generationBefore.bytes);
                await journalCase.mutate(node_path_1.default.join(currentRoot, "reservations", journalCase.journalName));
                const refusal = await expectCurrentError((0, refresh_current_ref_js_1.recoverTaskMapRefreshCurrentResidue)(currentRoot, runRoot, receipt), "recovery_refused");
                node_assert_1.default.strictEqual(refusal.committed, true);
                node_assert_1.default.deepStrictEqual(refusal.recoveryReceipt, receipt);
                await assertFilePreserved(objectBefore);
                await assertFilePreserved(generationBefore);
            });
        }
    });
    (0, node_test_1.it)("converges a release-gated recovery raced with exact same-ref publication", async () => {
        await withStores(async ({ currentRoot, runRoot }) => {
            const fixture = genesisCompleteFixture("recover-publish-race");
            await materializeFixture(runRoot, fixture);
            const interrupted = await expectCurrentError((0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
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
            }), "write_failed");
            const receipt = interrupted.recoveryReceipt;
            node_assert_1.default.ok(receipt);
            node_assert_1.default.strictEqual(interrupted.committed, false);
            const objectPath = node_path_1.default.join(currentRoot, "objects", receipt.objectName);
            const partial = await (0, promises_1.lstat)(objectPath, { bigint: true });
            node_assert_1.default.strictEqual(partial.nlink, 1n);
            node_assert_1.default.ok(partial.size > 0n);
            node_assert_1.default.ok(partial.size < BigInt(receipt.byteLength));
            let releasePublish;
            const release = new Promise((resolve) => {
                releasePublish = resolve;
            });
            let publishReady;
            const ready = new Promise((resolve) => {
                publishReady = resolve;
            });
            const exactPublish = (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
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
                exactPublish.then(() => {
                    throw new Error("exact publish passed the release gate");
                }, (error) => {
                    throw error;
                }),
            ]);
            const concurrentRecovery = (0, refresh_current_ref_js_1.recoverTaskMapRefreshCurrentResidue)(currentRoot, runRoot, receipt);
            releasePublish();
            const [publishOutcome, recoveryOutcome] = await Promise.allSettled([
                exactPublish,
                concurrentRecovery,
            ]);
            if (publishOutcome.status === "rejected") {
                node_assert_1.default.ok(publishOutcome.reason instanceof refresh_current_ref_js_1.TaskMapRefreshCurrentError);
                node_assert_1.default.notStrictEqual(publishOutcome.reason.code, "unsafe_target");
                node_assert_1.default.strictEqual(publishOutcome.reason.committed, true);
            }
            else {
                node_assert_1.default.ok(["published", "already_current"].includes(publishOutcome.value.status));
                node_assert_1.default.strictEqual(publishOutcome.value.ref.refId, receipt.refId);
            }
            if (recoveryOutcome.status === "rejected") {
                node_assert_1.default.ok(recoveryOutcome.reason instanceof refresh_current_ref_js_1.TaskMapRefreshCurrentError);
                node_assert_1.default.notStrictEqual(recoveryOutcome.reason.code, "unsafe_target");
                node_assert_1.default.strictEqual(recoveryOutcome.reason.committed, true);
                node_assert_1.default.strictEqual(recoveryOutcome.reason.recoveryReceipt?.refId, receipt.refId);
            }
            else {
                node_assert_1.default.ok(["recovered", "already_complete"].includes(recoveryOutcome.value));
            }
            const snapshot = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
            node_assert_1.default.strictEqual(snapshot.status, "healthy");
            node_assert_1.default.strictEqual(snapshot.generations.length, 1);
            node_assert_1.default.strictEqual(snapshot.head?.refId, receipt.refId);
            const generationPath = node_path_1.default.join(currentRoot, "generations", `${FIRST_GENERATION}.ref`);
            const object = await captureFile(objectPath);
            const generation = await captureFile(generationPath);
            node_assert_1.default.strictEqual(object.stats.nlink, 2n);
            node_assert_1.default.strictEqual(generation.stats.nlink, 2n);
            node_assert_1.default.strictEqual(generation.stats.dev, object.stats.dev);
            node_assert_1.default.strictEqual(generation.stats.ino, object.stats.ino);
            node_assert_1.default.deepStrictEqual(generation.bytes, object.bytes);
            node_assert_1.default.strictEqual(object.bytes.toString("utf8"), (0, source_contracts_js_1.taskMapContractCanonicalJson)(receipt.ref));
        });
    });
    (0, node_test_1.it)("recovers an exact committed receipt idempotently after a newer healthy generation", async () => {
        await withStores(async ({ currentRoot, runRoot }) => {
            const firstFixture = genesisCompleteFixture("historical-recovery-receipt");
            const upgrade = adapterUpgradeFixture(firstFixture);
            await materializeFixture(runRoot, firstFixture);
            await materializeFixture(runRoot, upgrade);
            const interrupted = await expectCurrentError((0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
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
            }), "write_failed");
            node_assert_1.default.strictEqual(interrupted.committed, true);
            const receipt = interrupted.recoveryReceipt;
            node_assert_1.default.ok(receipt);
            const second = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: upgrade.prepared.bundleId,
                expectedGeneration: FIRST_GENERATION,
                expectedRefId: receipt.refId,
                options: { operationToken: RETRY_OPERATION_TOKEN },
            });
            node_assert_1.default.strictEqual(second.ref.generation, SECOND_GENERATION);
            const generationOnePath = node_path_1.default.join(currentRoot, "generations", `${FIRST_GENERATION}.ref`);
            const generationTwoPath = node_path_1.default.join(currentRoot, "generations", `${SECOND_GENERATION}.ref`);
            const generationOneBefore = await captureFile(generationOnePath);
            const generationTwoBefore = await captureFile(generationTwoPath);
            for (let attempt = 0; attempt < 2; attempt += 1) {
                let result;
                try {
                    result = await (0, refresh_current_ref_js_1.recoverTaskMapRefreshCurrentResidue)(currentRoot, runRoot, receipt);
                }
                catch (error) {
                    node_assert_1.default.ok(error instanceof refresh_current_ref_js_1.TaskMapRefreshCurrentError);
                    node_assert_1.default.strictEqual(error.committed, true);
                    node_assert_1.default.deepStrictEqual(error.recoveryReceipt, receipt);
                    throw error;
                }
                node_assert_1.default.strictEqual(result, "already_complete");
            }
            await assertFilePreserved(generationOneBefore);
            await assertFilePreserved(generationTwoBefore);
            const snapshot = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
            node_assert_1.default.strictEqual(snapshot.status, "healthy");
            node_assert_1.default.strictEqual(snapshot.generations.length, 2);
            node_assert_1.default.strictEqual(snapshot.generations[0].refId, receipt.refId);
            node_assert_1.default.strictEqual(snapshot.head?.refId, second.ref.refId);
        });
    });
    (0, node_test_1.it)("rejects coercible recovery receipt identity leaves without executing them or touching residue", async () => {
        await withStores(async ({ currentRoot, runRoot }) => {
            const fixture = genesisCompleteFixture("coercible-recovery-receipt-identity");
            await materializeFixture(runRoot, fixture);
            const interrupted = await expectCurrentError((0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
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
            }), "write_failed");
            const receipt = interrupted.recoveryReceipt;
            node_assert_1.default.ok(receipt);
            const objectBefore = await captureFile(node_path_1.default.join(currentRoot, "objects", receipt.objectName));
            const reservationNamesBefore = await reservationEntries(currentRoot);
            const reservationTargetsBefore = await Promise.all(reservationNamesBefore.map((name) => (0, promises_1.readlink)(node_path_1.default.join(currentRoot, "reservations", name))));
            const objectNamesBefore = await (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "objects"));
            for (const field of [
                "operationToken",
                "rootDev",
                "rootIno",
                "dev",
                "ino",
            ]) {
                let coercionCalls = 0;
                const hostile = {
                    [Symbol.toPrimitive]() {
                        coercionCalls += 1;
                        throw new Error(`recovery receipt ${field} coerced`);
                    },
                };
                const candidate = {
                    ...receipt,
                    [field]: hostile,
                };
                const refusal = await expectCurrentError((0, refresh_current_ref_js_1.recoverTaskMapRefreshCurrentResidue)(currentRoot, runRoot, candidate), "recovery_refused");
                node_assert_1.default.strictEqual(coercionCalls, 0);
                node_assert_1.default.strictEqual(refusal.committed, false);
            }
            node_assert_1.default.deepStrictEqual(await reservationEntries(currentRoot), reservationNamesBefore);
            node_assert_1.default.deepStrictEqual(await Promise.all(reservationNamesBefore.map((name) => (0, promises_1.readlink)(node_path_1.default.join(currentRoot, "reservations", name)))), reservationTargetsBefore);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "objects")), objectNamesBefore);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "generations")), []);
            await assertFilePreserved(objectBefore);
        });
    });
    (0, node_test_1.it)("never executes poisoned Array.prototype.some or admits extra hardlinks", async () => {
        await withStores(async ({ currentRoot, runRoot }) => {
            const fixture = genesisCompleteFixture("poisoned-some-write");
            await materializeFixture(runRoot, fixture);
            const interrupted = await expectCurrentError((0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
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
            }), "write_failed");
            const receipt = interrupted.recoveryReceipt;
            node_assert_1.default.ok(receipt);
            const originalSome = Object.getOwnPropertyDescriptor(Array.prototype, "some");
            let someCalls = 0;
            Object.defineProperty(Array.prototype, "some", {
                ...originalSome,
                value() {
                    someCalls += 1;
                    return true;
                },
            });
            let recovered;
            let published;
            try {
                recovered = await (0, refresh_current_ref_js_1.recoverTaskMapRefreshCurrentResidue)(currentRoot, runRoot, receipt);
            }
            finally {
                Object.defineProperty(Array.prototype, "some", originalSome);
            }
            node_assert_1.default.strictEqual(someCalls, 0);
            node_assert_1.default.strictEqual(recovered, "recovered");
            published = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: fixture.prepared.bundleId,
                expectedGeneration: ZERO_GENERATION,
                options: { operationToken: PRIMARY_OPERATION_TOKEN },
            });
            node_assert_1.default.strictEqual(published?.status, "published");
            const objectPath = node_path_1.default.join(currentRoot, "objects", receipt.objectName);
            const generationPath = node_path_1.default.join(currentRoot, "generations", `${FIRST_GENERATION}.ref`);
            const object = await captureFile(objectPath);
            const generation = await captureFile(generationPath);
            node_assert_1.default.strictEqual(object.stats.nlink, 2n);
            node_assert_1.default.strictEqual(generation.stats.dev, object.stats.dev);
            node_assert_1.default.strictEqual(generation.stats.ino, object.stats.ino);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "generations")), [`${FIRST_GENERATION}.ref`]);
        });
        await withStores(async ({ parent, currentRoot, runRoot }) => {
            const fixture = genesisCompleteFixture("poisoned-some-bypass");
            await materializeFixture(runRoot, fixture);
            const interrupted = await expectCurrentError((0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
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
            }), "write_failed");
            const receipt = interrupted.recoveryReceipt;
            node_assert_1.default.ok(receipt);
            const objectPath = node_path_1.default.join(currentRoot, "objects", receipt.objectName);
            const peerOnePath = node_path_1.default.join(parent, "poisoned-some-peer-one.bin");
            const peerTwoPath = node_path_1.default.join(parent, "poisoned-some-peer-two.bin");
            await (0, promises_1.link)(objectPath, peerOnePath);
            await (0, promises_1.link)(objectPath, peerTwoPath);
            const objectBefore = await captureFile(objectPath);
            const peerOneBefore = await captureFile(peerOnePath);
            const peerTwoBefore = await captureFile(peerTwoPath);
            node_assert_1.default.strictEqual(objectBefore.stats.nlink, 3n);
            const originalSome = Object.getOwnPropertyDescriptor(Array.prototype, "some");
            let someCalls = 0;
            Object.defineProperty(Array.prototype, "some", {
                ...originalSome,
                value() {
                    someCalls += 1;
                    return true;
                },
            });
            let refusal;
            try {
                await (0, refresh_current_ref_js_1.recoverTaskMapRefreshCurrentResidue)(currentRoot, runRoot, receipt);
            }
            catch (error) {
                refusal = error;
            }
            finally {
                Object.defineProperty(Array.prototype, "some", originalSome);
            }
            node_assert_1.default.strictEqual(someCalls, 0);
            node_assert_1.default.ok(refusal instanceof refresh_current_ref_js_1.TaskMapRefreshCurrentError);
            node_assert_1.default.strictEqual(refusal.code, "recovery_refused");
            node_assert_1.default.strictEqual(refusal.committed, false);
            await assertFilePreserved(objectBefore);
            await assertFilePreserved(peerOneBefore);
            await assertFilePreserved(peerTwoBefore);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(node_path_1.default.join(currentRoot, "generations")), []);
        });
    });
});
