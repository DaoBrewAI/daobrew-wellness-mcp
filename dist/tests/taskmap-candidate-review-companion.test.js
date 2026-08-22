"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = __importDefault(require("node:assert"));
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_module_1 = require("node:module");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const node_util_1 = require("node:util");
const node_test_1 = require("node:test");
const candidate_review_companion_js_1 = require("../src/engine/taskmap/candidate-review-companion.js");
const harness_js_1 = require("../src/engine/taskmap/harness.js");
const identity_dedupe_projection_js_1 = require("../src/engine/taskmap/identity-dedupe-projection.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const refresh_plan_js_1 = require("../src/engine/taskmap/refresh-plan.js");
const refresh_run_bundle_js_1 = require("../src/engine/taskmap/refresh-run-bundle.js");
const refresh_current_ref_js_1 = require("../src/engine/taskmap/refresh-current-ref.js");
const work_control_decision_js_1 = require("../src/engine/taskmap/work-control-decision.js");
const types_js_1 = require("../src/engine/taskmap/types.js");
const GENERATED_AT = "2026-07-28T12:00:00.000Z";
const BRAIN_KEY = "p10.3b-semantic-brain-key-00000000000000000001";
const BRIDGE_KEY = "p10.3b-evidence-bridge-key-0000000000000000002";
const WRONG_KEY = "p10.3b-evidence-bridge-key-wrong-00000000000003";
const digest = (label) => (0, source_contracts_js_1.taskMapContractDigest)(`p10.3b-test:${label}`);
const OWNER_SCOPE_DIGEST = digest("owner");
const COMMONJS_REQUIRE = (0, node_module_1.createRequire)(__filename);
const MUTABLE_CRYPTO_EXPORTS = COMMONJS_REQUIRE("node:crypto");
const MUTABLE_WORK_CONTROL_EXPORTS = COMMONJS_REQUIRE("../src/engine/taskmap/work-control-decision.js");
function clone(value) {
    return structuredClone(value);
}
function omitUndefined(value) {
    return JSON.parse(JSON.stringify(value));
}
function binding(sourceKind, suffix) {
    return {
        connectionId: `p103b-${suffix}`,
        sourceKind,
        tenantOrWorkspaceDigest: digest(`workspace:${suffix}`),
        accountOrPrincipalDigest: digest(`principal:${suffix}`),
        grantVersion: `${suffix}-read-v1`,
    };
}
const LINEAR_BINDING = binding("linear", "linear");
const GRANOLA_BINDING = binding("granola", "granola");
const OURA_BINDING = binding("oura", "oura");
function scenario(bodyLabel = "body-a") {
    const bodyObjectId = digest(`oura-object:${bodyLabel}`);
    const bodyRevision = digest(`oura-revision:${bodyLabel}`);
    const input = {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        generatedAt: GENERATED_AT,
        pointers: [
            {
                id: "linear-accepted",
                sourceKind: "linear",
                sourceObjectId: "linear-task-accepted",
                sourceRefHash: digest("linear-ref"),
                sourceVersion: "linear-revision-v1",
                authority: "source_system",
                syncMode: "reference_only",
                capabilities: ["read_task"],
            },
            {
                id: "granola-candidate",
                sourceKind: "granola",
                sourceObjectId: "granola-meeting-note",
                sourceRefHash: digest("granola-ref"),
                sourceVersion: "granola-revision-v1",
                authority: "none",
                syncMode: "reference_only",
                capabilities: ["read_context"],
            },
            {
                id: "oura-body",
                sourceKind: "oura",
                sourceObjectId: bodyObjectId,
                sourceRefHash: digest(`oura-ref:${bodyLabel}`),
                sourceVersion: bodyRevision,
                authority: "none",
                syncMode: "reference_only",
                capabilities: ["read_context"],
            },
        ],
        events: [
            {
                id: "event-linear-accepted",
                pointerId: "linear-accepted",
                recordKind: "authoritative_task",
                activity: "task_created",
                // Deliberately differs from the source envelope eventTime. A task
                // occurrence is not universally the source-object revision anchor.
                occurredAt: "2026-07-28T01:00:00.000Z",
                observedAt: GENERATED_AT,
                objectRefs: ["work:accepted"],
                title: "Ship the accepted work",
                summary: "Existing source-owned work.",
                extractionConfidence: 1,
                sourceStatus: "in_progress",
                priority: 1,
            },
            {
                id: "event-granola-candidate",
                pointerId: "granola-candidate",
                recordKind: "work_context",
                activity: "commitment_stated",
                // Deliberately differs from the meeting anchor below.
                occurredAt: "2026-07-28T10:30:00.000Z",
                observedAt: GENERATED_AT,
                objectRefs: ["work:candidate"],
                title: "Turn the meeting commitment into reviewable work",
                summary: "The source is context, not lifecycle authority.",
                extractionConfidence: 0.95,
            },
            {
                id: "event-oura-body",
                pointerId: "oura-body",
                recordKind: "body_context",
                activity: "body_window_observed",
                occurredAt: "2026-07-28T07:00:00.000Z",
                observedAt: GENERATED_AT,
                dayKey: "2026-07-28",
                objectRefs: ["body:2026-07-28"],
                title: `Private relative body context ${bodyLabel}`,
                summary: "Body context may annotate but never create membership.",
                extractionConfidence: 1,
                bodyCategory: "below_baseline",
                bodyAxis: "hrv",
            },
        ],
    };
    const brain = {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        provider: "candidate-companion-test-brain",
        model: "deterministic-test-model",
        promptHash: digest("prompt"),
        inputDigest: (0, harness_js_1.taskMapSemanticInputDigest)(input),
        generatedAt: GENERATED_AT,
        roots: [{
                proposalId: "proposal-root",
                title: "Productize Task Map",
                summary: "Accepted and newly discovered work share one workstream.",
                evidenceEventIds: [
                    "event-linear-accepted",
                    "event-granola-candidate",
                ],
                memberObjectRefs: ["work:accepted", "work:candidate"],
                confidence: 0.95,
            }],
        tasks: [
            {
                proposalId: "proposal-accepted",
                rootProposalId: "proposal-root",
                title: "Ship the accepted work",
                summary: "Source-owned lifecycle remains authoritative.",
                evidenceEventIds: ["event-linear-accepted"],
                authoritativeTaskEventId: "event-linear-accepted",
                openState: "open",
                confidence: 1,
            },
            {
                proposalId: "proposal-candidate",
                rootProposalId: "proposal-root",
                title: "Review the meeting commitment",
                summary: "Candidate only until the owner accepts it.",
                evidenceEventIds: ["event-granola-candidate"],
                openState: "possibly_open",
                confidence: 0.9,
            },
        ],
        edges: [
            {
                proposalId: "edge-root-accepted",
                fromProposalId: "proposal-root",
                toProposalId: "proposal-accepted",
                relation: "advances",
                evidenceEventIds: ["event-linear-accepted"],
                confidence: 1,
            },
            {
                proposalId: "edge-root-candidate",
                fromProposalId: "proposal-root",
                toProposalId: "proposal-candidate",
                relation: "advances",
                evidenceEventIds: ["event-granola-candidate"],
                confidence: 0.9,
            },
        ],
    };
    const fullProjection = clone((0, harness_js_1.buildTaskMapProjection)(input, brain, {
        arm: "E4",
        now: GENERATED_AT,
    }));
    node_assert_1.default.strictEqual(fullProjection.runStatus, "accepted");
    node_assert_1.default.deepStrictEqual(fullProjection.rejections, []);
    const proposedTaskIds = new Set(fullProjection.tasks
        .filter((task) => task.reviewState === "proposed")
        .map((task) => task.id));
    node_assert_1.default.strictEqual(proposedTaskIds.size, 1);
    const projection = omitUndefined({
        ...fullProjection,
        tasks: fullProjection.tasks.filter((task) => (!proposedTaskIds.has(task.id))),
        roots: fullProjection.roots.map((root) => ({
            ...root,
            taskIds: root.taskIds.filter((id) => !proposedTaskIds.has(id)),
        })),
        edges: fullProjection.edges.filter((edge) => (!proposedTaskIds.has(edge.from) && !proposedTaskIds.has(edge.to))),
    });
    node_assert_1.default.deepStrictEqual((0, harness_js_1.taskMapProjectionArtifactValidationReasons)(projection), []);
    node_assert_1.default.strictEqual(projection.inputDigest, (0, harness_js_1.taskMapInputDigest)(input));
    const linearEnvelope = (0, source_contracts_js_1.buildTaskMapSourceEnvelope)({
        ownerScopeDigest: OWNER_SCOPE_DIGEST,
        binding: LINEAR_BINDING,
        sourceKind: "linear",
        objectType: "authoritative_task",
        sourceObjectId: "linear-task-accepted",
        sourceRevision: "linear-revision-v1",
        eventTime: GENERATED_AT,
        contentDigest: digest("linear-content"),
        authority: {
            evidence: "authoritative_task",
            quality: "source_native",
            lifecycle: "source_status",
            completion: "source_status",
            rank: "accepted_work",
        },
    });
    const granolaEnvelope = (0, source_contracts_js_1.buildTaskMapSourceEnvelope)({
        ownerScopeDigest: OWNER_SCOPE_DIGEST,
        binding: GRANOLA_BINDING,
        sourceKind: "granola",
        objectType: "meeting_note",
        sourceObjectId: "granola-meeting-note",
        sourceRevision: "granola-revision-v1",
        eventTime: "2026-07-28T10:00:00.000Z",
        contentDigest: digest("granola-content"),
        authority: {
            evidence: "provider_generated_summary",
            quality: "provider_summary",
            lifecycle: "none",
            completion: "none",
            rank: "candidate_only",
        },
        meetingIdentity: {
            fingerprintVersion: "taskmap-meeting-fingerprint.1",
            startAt: "2026-07-28T10:00:00.000Z",
            endAt: "2026-07-28T11:00:00.000Z",
            normalizedTitleDigest: digest("meeting-title"),
            participantSetDigest: digest("meeting-participants"),
        },
    });
    const ouraEnvelope = (0, source_contracts_js_1.buildTaskMapSourceEnvelope)({
        ownerScopeDigest: OWNER_SCOPE_DIGEST,
        binding: OURA_BINDING,
        sourceKind: "oura",
        objectType: "body_context",
        sourceObjectId: bodyObjectId,
        sourceRevision: bodyRevision,
        eventTime: "2026-07-28T07:00:00.000Z",
        contentDigest: digest(`oura-content:${bodyLabel}`),
        authority: {
            evidence: "body_context_only",
            quality: "coverage_only",
            lifecycle: "none",
            completion: "none",
            rank: "body_bonus_only",
        },
    });
    const snapshot = (0, source_contracts_js_1.buildTaskMapSourceSnapshot)([linearEnvelope, granolaEnvelope, ouraEnvelope], []);
    const acceptedTask = projection.tasks.find((task) => (task.reviewState === "accepted"));
    node_assert_1.default.ok(acceptedTask);
    return {
        input,
        brain,
        projection,
        snapshot,
        linearEnvelope,
        granolaEnvelope,
        ouraEnvelope,
        reviewedMappings: [
            {
                eventId: "event-linear-accepted",
                sourceEnvelopeId: linearEnvelope.envelopeId,
            },
            {
                eventId: "event-granola-candidate",
                sourceEnvelopeId: granolaEnvelope.envelopeId,
            },
        ],
        workBindings: [{
                projectionKind: "task",
                projectionId: acceptedTask.id,
                sourceEnvelopeId: linearEnvelope.envelopeId,
            }],
        lifecycleAdjudications: [{
                canonicalSourceObjectKeyDigest: linearEnvelope.sourceObjectKeyDigest,
                previousState: "absent",
                currentState: "open",
                currentSourceIdentityDigest: linearEnvelope.sourceIdentityDigest,
                adjudicatedDelta: "open",
            }],
    };
}
function providersFor(snapshot) {
    const providers = new Map();
    for (const envelope of snapshot.envelopes) {
        const bindingDigest = (0, source_contracts_js_1.taskMapContractDigest)(envelope.binding);
        const capabilities = envelope.sourceKind === "linear"
            ? ["read_task"]
            : ["read_context"];
        providers.set(bindingDigest, {
            binding: envelope.binding,
            bindingDigest,
            sourceKind: envelope.sourceKind,
            adapterVersion: `${envelope.sourceKind}-adapter.1`,
            capabilities,
            sourceContractVersion: envelope.contractVersion,
        });
    }
    return [...providers.values()].sort((left, right) => (left.bindingDigest < right.bindingDigest ? -1
        : left.bindingDigest > right.bindingDigest ? 1
            : 0));
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
        digest: digest(`policy:${name}`),
    }));
}
function refreshLanes(providers) {
    const lane = (value) => ({
        contractVersion: refresh_plan_js_1.TASKMAP_REFRESH_LANE_VERSION,
        ...value,
    });
    const providerLanes = providers.flatMap((provider, index) => [
        lane({
            laneId: `collect-${index}`,
            goal: "provider_collect",
            operationVersion: `${provider.sourceKind}-collect.1`,
            priority: "P0",
            priorityReasonCodes: ["source_freshness"],
            predecessorLaneIds: [],
            resourceClaims: [{
                    resourceId: `provider:${provider.sourceKind}:${index}`,
                    mode: "shared",
                }],
            effect: "read_only",
            requiredForPublication: true,
            inputDigests: [provider.bindingDigest],
            outputKinds: ["connector_checkpoint", "source_slice"],
        }),
        lane({
            laneId: `normalize-${index}`,
            goal: "source_normalize",
            operationVersion: `${provider.sourceKind}-normalize.1`,
            priority: "P0",
            priorityReasonCodes: ["identity_integrity"],
            predecessorLaneIds: [`collect-${index}`],
            resourceClaims: [{
                    resourceId: `normalization:${provider.sourceKind}:${index}`,
                    mode: "shared",
                }],
            effect: "local_state",
            requiredForPublication: true,
            inputDigests: [provider.bindingDigest],
            outputKinds: ["normalized_source"],
        }),
    ]);
    return [
        ...providerLanes,
        lane({
            laneId: "identity",
            goal: "identity_dedupe_barrier",
            operationVersion: "identity.2",
            priority: "P0",
            priorityReasonCodes: ["identity_integrity"],
            predecessorLaneIds: providers.map((_, index) => (`normalize-${index}`)),
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
function prepareAcceptedOrigin(value) {
    const providers = providersFor(value.snapshot);
    const sourceRevisions = value.snapshot.envelopes.map((envelope) => ({
        bindingDigest: (0, source_contracts_js_1.taskMapContractDigest)(envelope.binding),
        sourceIdentityDigest: envelope.sourceIdentityDigest,
        sourceRevisionDigest: (0, source_contracts_js_1.taskMapContractDigest)(envelope.sourceRevision),
        contentDigest: envelope.contentDigest,
    })).sort((left, right) => (left.bindingDigest < right.bindingDigest ? -1
        : left.bindingDigest > right.bindingDigest ? 1
            : left.sourceIdentityDigest < right.sourceIdentityDigest ? -1
                : left.sourceIdentityDigest > right.sourceIdentityDigest ? 1
                    : 0));
    const sourceRevisionSets = providers.map((provider) => ({
        bindingDigest: provider.bindingDigest,
        revisionSetDigest: (0, source_contracts_js_1.taskMapContractDigest)(sourceRevisions
            .filter((revision) => (revision.bindingDigest === provider.bindingDigest))
            .map((revision) => ({
            sourceIdentityDigest: revision.sourceIdentityDigest,
            sourceRevisionDigest: revision.sourceRevisionDigest,
            contentDigest: revision.contentDigest,
        }))
            .sort((left, right) => (left.sourceIdentityDigest < right.sourceIdentityDigest ? -1
            : left.sourceIdentityDigest > right.sourceIdentityDigest ? 1
                : 0))),
    }));
    const reviewAttestationDigest = digest("review-attestation");
    const deterministicReplayDigest = (0, identity_dedupe_projection_js_1.taskMapIdentityDedupeReplayClosureDigest)(value.snapshot, value.projection, {
        aliases: [],
        workBindings: value.workBindings,
        sessionLineage: [],
        lifecycleAdjudications: value.lifecycleAdjudications,
    }, reviewAttestationDigest);
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
            truthSetDigest: digest("truth"),
            reviewBatchDigest: digest("review-batch"),
            reviewAttestationVersion: refresh_plan_js_1.TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION,
            reviewAttestationDigest,
            sourceManifestDigest: digest("source-manifest"),
        },
        sourceBindings: providers.map((provider) => ({
            bindingDigest: provider.bindingDigest,
            sourceKind: provider.sourceKind,
            sourceContractVersion: provider.sourceContractVersion,
            adapterVersion: provider.adapterVersion,
        })),
        sourceRevisions,
        sourceRevisionSets,
        semanticInputDigests: [value.snapshot.semanticInputDigest],
        deterministicReplayDigest,
        policyBindings: policyBindings(),
        lanes: refreshLanes(providers),
    });
    const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
        maxConcurrency: 4,
        laneStates: plan.lanes.map((lane) => ({
            laneId: lane.laneId,
            status: "succeeded",
        })),
    });
    node_assert_1.default.strictEqual(batch.publication.state, "complete");
    const connectorCheckpoints = providers.map((provider) => {
        const identities = value.snapshot.envelopes
            .filter((envelope) => ((0, source_contracts_js_1.taskMapContractDigest)(envelope.binding)
            === provider.bindingDigest))
            .map((envelope) => envelope.sourceIdentityDigest)
            .sort();
        return (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(null, {
            binding: provider.binding,
            sourceKind: provider.sourceKind,
            adapterVersion: provider.adapterVersion,
            capabilities: provider.capabilities,
            state: "success",
            attemptedAt: GENERATED_AT,
            proposedWatermark: {
                kind: "revision",
                valueDigest: digest(`watermark:${provider.bindingDigest}`),
                observedThrough: GENERATED_AT,
            },
            acceptedSourceIdentityDigests: identities,
        });
    });
    const sourceSliceProofs = providers.map((provider, index) => ((0, refresh_run_bundle_js_1.buildTaskMapRefreshRunSourceSliceProof)({
        ownerScopeDigest: OWNER_SCOPE_DIGEST,
        bindingDigest: provider.bindingDigest,
        sourceRevisions: sourceRevisions.filter((revision) => (revision.bindingDigest === provider.bindingDigest)),
        acceptedSourceIdentityDigests: connectorCheckpoints[index].acceptedSourceIdentityDigests,
    })));
    const attemptOutputs = providers.map((_, index) => ({
        laneId: `collect-${index}`,
        checkpointDigest: (0, source_contracts_js_1.taskMapContractDigest)(connectorCheckpoints[index]),
        sourceSliceDigest: sourceSliceProofs[index].sourceSliceDigest,
    }));
    return (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)({
        plan,
        batch,
        connectorCheckpoints,
        attemptOutputs,
        sourceSliceProofs,
        sourceSnapshot: value.snapshot,
    });
}
async function productFixture(bodyLabel = "body-a") {
    const value = scenario(bodyLabel);
    const base = await (0, promises_1.realpath)(await (0, promises_1.mkdtemp)(node_path_1.default.join((0, node_os_1.tmpdir)(), "p103b-candidate-")));
    const currentRoot = node_path_1.default.join(base, "current");
    const runRoot = node_path_1.default.join(base, "run");
    const sidecarRoot = node_path_1.default.join(base, "sidecar");
    await Promise.all([
        (0, promises_1.mkdir)(currentRoot, { mode: 0o700 }),
        (0, promises_1.mkdir)(runRoot, { mode: 0o700 }),
        (0, promises_1.mkdir)(sidecarRoot, { mode: 0o700 }),
    ]);
    await (0, refresh_current_ref_js_1.initializeTaskMapRefreshCurrentStore)(currentRoot);
    await (0, identity_dedupe_projection_js_1.initializeTaskMapIdentityDedupeProjectionStore)({
        currentRoot,
        runRoot,
        sidecarRoot,
    });
    const prepared = prepareAcceptedOrigin(value);
    await (0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, prepared);
    await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
        currentRoot,
        runRoot,
        bundleId: prepared.bundleId,
        expectedGeneration: "00000000000000000000",
        options: {
            operationToken: bodyLabel === "body-a"
                ? "34".repeat(16)
                : "56".repeat(16),
        },
    });
    await (0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)({
        currentRoot,
        runRoot,
        sidecarRoot,
        sourceSnapshot: value.snapshot,
        projection: value.projection,
        aliases: [],
        workBindings: value.workBindings,
        sessionLineage: [],
        lifecycleAdjudications: value.lifecycleAdjudications,
    });
    const workControl = (await (0, work_control_decision_js_1.buildTaskMapWorkControlDecision)({
        currentRoot,
        runRoot,
        sidecarRoot,
        projection: value.projection,
    })).artifact;
    const brainArtifact = (0, source_contracts_js_1.attestTaskMapSemanticBrain)(value.snapshot.semanticInputDigest, value.brain, BRAIN_KEY);
    const bridge = (0, candidate_review_companion_js_1.buildTaskMapCandidateEvidenceBridge)({
        taskMapInput: value.input,
        sourceSnapshot: value.snapshot,
        semanticBrainArtifact: brainArtifact,
        semanticBrainAttestationKey: BRAIN_KEY,
        bridgeAttestationKey: BRIDGE_KEY,
        reviewedMappings: value.reviewedMappings,
    });
    return {
        ...value,
        base,
        currentRoot,
        runRoot,
        sidecarRoot,
        workControl,
        brainArtifact,
        bridge,
    };
}
function buildInput(fixture) {
    return {
        currentRoot: fixture.currentRoot,
        runRoot: fixture.runRoot,
        sidecarRoot: fixture.sidecarRoot,
        projection: fixture.projection,
        taskMapInput: fixture.input,
        workControlDecision: fixture.workControl,
        companion: {
            sourceSnapshot: fixture.snapshot,
            semanticBrainArtifact: fixture.brainArtifact,
            semanticBrainAttestationKey: BRAIN_KEY,
            evidenceBridge: fixture.bridge,
            bridgeAttestationKey: BRIDGE_KEY,
        },
    };
}
function companionForBrain(fixture, brain, snapshot = fixture.snapshot, taskMapInput = fixture.input, reviewedMappings = fixture.reviewedMappings) {
    const brainArtifact = (0, source_contracts_js_1.attestTaskMapSemanticBrain)(snapshot.semanticInputDigest, brain, BRAIN_KEY);
    const bridge = (0, candidate_review_companion_js_1.buildTaskMapCandidateEvidenceBridge)({
        taskMapInput,
        sourceSnapshot: snapshot,
        semanticBrainArtifact: brainArtifact,
        semanticBrainAttestationKey: BRAIN_KEY,
        bridgeAttestationKey: BRIDGE_KEY,
        reviewedMappings,
    });
    return { brainArtifact, bridge };
}
function productInputForBrain(fixture, brain, snapshot = fixture.snapshot, taskMapInput = fixture.input, reviewedMappings = fixture.reviewedMappings) {
    const companion = companionForBrain(fixture, brain, snapshot, taskMapInput, reviewedMappings);
    return {
        currentRoot: fixture.currentRoot,
        runRoot: fixture.runRoot,
        sidecarRoot: fixture.sidecarRoot,
        projection: fixture.projection,
        taskMapInput,
        workControlDecision: fixture.workControl,
        companion: {
            sourceSnapshot: snapshot,
            semanticBrainArtifact: companion.brainArtifact,
            semanticBrainAttestationKey: BRAIN_KEY,
            evidenceBridge: companion.bridge,
            bridgeAttestationKey: BRIDGE_KEY,
        },
    };
}
function coordinatedBridgeRehash(bridge) {
    const { bridgeId: _bridgeId, bridgeDigest: _bridgeDigest, ...core } = bridge;
    const bridgeDigest = (0, source_contracts_js_1.taskMapContractDigest)(core);
    return {
        ...bridge,
        bridgeId: `tmcandidatebridge_${bridgeDigest}`,
        bridgeDigest,
    };
}
function coordinatedArtifactRehash(artifact) {
    const { artifactId: _artifactId, artifactDigest: _artifactDigest, ...core } = artifact;
    const artifactDigest = (0, source_contracts_js_1.taskMapContractDigest)(core);
    return {
        ...artifact,
        artifactId: `tmcandidatereview_${artifactDigest}`,
        artifactDigest,
    };
}
let primary;
const cleanup = [];
(0, node_test_1.before)(async () => {
    primary = await productFixture("body-a");
    cleanup.push(primary.base);
});
(0, node_test_1.after)(async () => {
    await Promise.all(cleanup.map((base) => (0, promises_1.rm)(base, {
        recursive: true,
        force: true,
    })));
});
(0, node_test_1.describe)("P10.3b candidate-review companion", () => {
    (0, node_test_1.it)("pins versions and emits one candidate-only, token-only review row", async () => {
        node_assert_1.default.strictEqual(candidate_review_companion_js_1.TASKMAP_CANDIDATE_EVIDENCE_BRIDGE_VERSION, "taskmap-candidate-evidence-bridge.v1");
        node_assert_1.default.strictEqual(candidate_review_companion_js_1.TASKMAP_CANDIDATE_REVIEW_COMPANION_VERSION, "taskmap-candidate-review-companion.v1");
        node_assert_1.default.strictEqual(candidate_review_companion_js_1.TASKMAP_CANDIDATE_REVIEW_POLICY_VERSION, "taskmap-candidate-review-policy.1");
        const built = await (0, candidate_review_companion_js_1.buildTaskMapCandidateReviewCompanion)(buildInput(primary));
        node_assert_1.default.strictEqual(built.artifact.candidateCoverage, "available_attested_candidate_only");
        node_assert_1.default.strictEqual(built.artifact.reviewNext.length, 1);
        node_assert_1.default.match(built.artifact.reviewNext[0].candidateId, /^tmcandidate_[a-f0-9]{64}$/);
        node_assert_1.default.match(built.artifact.reviewNext[0].candidateGroupId, /^tmcandidategroup_[a-f0-9]{64}$/);
        node_assert_1.default.strictEqual(built.artifact.reviewNext[0].evidenceCount, 1);
        node_assert_1.default.strictEqual(built.canonicalBytes, (0, candidate_review_companion_js_1.taskMapCandidateReviewCompanionCanonicalBytes)(built.artifact, BRIDGE_KEY));
        node_assert_1.default.deepStrictEqual((0, candidate_review_companion_js_1.assertTaskMapCandidateReviewCompanion)(built.artifact, BRIDGE_KEY), built.artifact);
        node_assert_1.default.deepStrictEqual((0, candidate_review_companion_js_1.assertTaskMapCandidateEvidenceBridge)(primary.bridge, BRIDGE_KEY), primary.bridge);
    });
    (0, node_test_1.it)("treats only a wholly omitted companion as unavailable", async () => {
        const input = buildInput(primary);
        delete input.companion;
        const built = await (0, candidate_review_companion_js_1.buildTaskMapCandidateReviewCompanion)(input);
        node_assert_1.default.strictEqual(built.artifact.candidateCoverage, "unavailable_missing_companion");
        node_assert_1.default.deepStrictEqual(built.artifact.reviewNext, []);
        node_assert_1.default.strictEqual(built.artifact.bridgeDigest, null);
        node_assert_1.default.strictEqual(built.artifact.semanticBrainDigest, null);
        node_assert_1.default.strictEqual(built.artifact.attestationKeyId, null);
        node_assert_1.default.strictEqual(built.artifact.attestationMac, null);
        node_assert_1.default.strictEqual((0, candidate_review_companion_js_1.taskMapCandidateReviewCompanionCanonicalBytes)(built.artifact), built.canonicalBytes);
        const explicitUndefined = buildInput(primary);
        explicitUndefined.companion = undefined;
        await node_assert_1.default.rejects((0, candidate_review_companion_js_1.buildTaskMapCandidateReviewCompanion)(explicitUndefined), /undefined|non-JSON/);
        const partial = buildInput(primary);
        partial.companion = {
            sourceSnapshot: primary.snapshot,
        };
        await node_assert_1.default.rejects((0, candidate_review_companion_js_1.buildTaskMapCandidateReviewCompanion)(partial), /missing or unknown fields/);
    });
    (0, node_test_1.it)("replays bridge and product bytes deterministically", async () => {
        const replayBridge = (0, candidate_review_companion_js_1.buildTaskMapCandidateEvidenceBridge)({
            taskMapInput: primary.input,
            sourceSnapshot: primary.snapshot,
            semanticBrainArtifact: primary.brainArtifact,
            semanticBrainAttestationKey: BRAIN_KEY,
            bridgeAttestationKey: BRIDGE_KEY,
            reviewedMappings: [...primary.reviewedMappings].reverse(),
        });
        node_assert_1.default.deepStrictEqual(replayBridge, primary.bridge);
        const first = await (0, candidate_review_companion_js_1.buildTaskMapCandidateReviewCompanion)(buildInput(primary));
        const second = await (0, candidate_review_companion_js_1.buildTaskMapCandidateReviewCompanion)(buildInput(primary));
        node_assert_1.default.deepStrictEqual(second.artifact, first.artifact);
        node_assert_1.default.strictEqual(second.canonicalBytes, first.canonicalBytes);
    });
    (0, node_test_1.it)("rejects an authenticated own-undefined optional before candidate ID derivation", async () => {
        const omittedReplay = await (0, candidate_review_companion_js_1.buildTaskMapCandidateReviewCompanion)(buildInput(primary));
        const brainWithUndefined = clone(primary.brain);
        Object.defineProperty(brainWithUndefined.tasks[1], "proposedReturnPointerId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: undefined,
        });
        const undefinedArtifact = (0, source_contracts_js_1.attestTaskMapSemanticBrain)(primary.snapshot.semanticInputDigest, brainWithUndefined, BRAIN_KEY);
        // Frozen P9.2 canonicalization drops own undefined. P10.3b must reject
        // the ambiguous runtime shape instead of deriving a different candidate.
        node_assert_1.default.strictEqual(undefinedArtifact.attestationMac, primary.brainArtifact.attestationMac);
        node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.buildTaskMapCandidateEvidenceBridge)({
            taskMapInput: primary.input,
            sourceSnapshot: primary.snapshot,
            semanticBrainArtifact: undefinedArtifact,
            semanticBrainAttestationKey: BRAIN_KEY,
            bridgeAttestationKey: BRIDGE_KEY,
            reviewedMappings: primary.reviewedMappings,
        }), /undefined data property/);
        const product = buildInput(primary);
        product.companion.semanticBrainArtifact = undefinedArtifact;
        let afterWorkControlCalls = 0;
        await node_assert_1.default.rejects((0, candidate_review_companion_js_1.unsafeBuildTaskMapCandidateReviewCompanionWithAfterWorkControlStartedForTest)(product, () => {
            afterWorkControlCalls += 1;
        }), /undefined data property/);
        node_assert_1.default.strictEqual(afterWorkControlCalls, 0);
        const replay = await (0, candidate_review_companion_js_1.buildTaskMapCandidateReviewCompanion)(buildInput(primary));
        node_assert_1.default.deepStrictEqual(replay.artifact, omittedReplay.artifact);
    });
});
(0, node_test_1.describe)("P10.3b evidence closure and authority boundaries", () => {
    (0, node_test_1.it)("accepts a separately attested candidate brain without requiring projection brain equality", async () => {
        const brain = clone(primary.brain);
        brain.provider = "separate-candidate-brain";
        brain.model = "separate-candidate-model";
        brain.tasks[1].title = "A separately attested candidate";
        brain.tasks[1].summary =
            "This semantic artifact is not the accepted projection brain.";
        const built = await (0, candidate_review_companion_js_1.buildTaskMapCandidateReviewCompanion)(productInputForBrain(primary, brain));
        node_assert_1.default.strictEqual(built.artifact.reviewNext.length, 1);
        node_assert_1.default.notStrictEqual(built.artifact.semanticBrainDigest, primary.bridge.semanticBrainDigest);
        node_assert_1.default.strictEqual(built.artifact.workControlArtifactDigest, primary.workControl.artifactDigest);
    });
    (0, node_test_1.it)("keeps a complete zero-candidate companion available with empty Review Next", async () => {
        const brain = clone(primary.brain);
        brain.tasks = brain.tasks.filter((task) => (task.authoritativeTaskEventId !== undefined));
        brain.edges = brain.edges.filter((edge) => (edge.toProposalId !== "proposal-candidate"));
        const built = await (0, candidate_review_companion_js_1.buildTaskMapCandidateReviewCompanion)(productInputForBrain(primary, brain));
        node_assert_1.default.strictEqual(built.artifact.candidateCoverage, "available_attested_candidate_only");
        node_assert_1.default.deepStrictEqual(built.artifact.reviewNext, []);
        node_assert_1.default.ok(built.artifact.bridgeDigest);
        node_assert_1.default.ok(built.artifact.semanticBrainDigest);
    });
    (0, node_test_1.it)("requires the exact union of all root, task, and edge evidence", () => {
        const common = {
            taskMapInput: primary.input,
            sourceSnapshot: primary.snapshot,
            semanticBrainArtifact: primary.brainArtifact,
            semanticBrainAttestationKey: BRAIN_KEY,
            bridgeAttestationKey: BRIDGE_KEY,
        };
        node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.buildTaskMapCandidateEvidenceBridge)({
            ...common,
            reviewedMappings: [primary.reviewedMappings[0]],
        }), /incomplete or contain extras/);
        node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.buildTaskMapCandidateEvidenceBridge)({
            ...common,
            reviewedMappings: [
                ...primary.reviewedMappings,
                {
                    eventId: "event-not-attested",
                    sourceEnvelopeId: primary.linearEnvelope.envelopeId,
                },
            ],
        }), /incomplete or contain extras/);
        node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.buildTaskMapCandidateEvidenceBridge)({
            ...common,
            reviewedMappings: [
                primary.reviewedMappings[0],
                primary.reviewedMappings[0],
            ],
        }), /duplicated/);
        node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.buildTaskMapCandidateEvidenceBridge)({
            ...common,
            reviewedMappings: [
                primary.reviewedMappings[0],
                {
                    eventId: "event-granola-candidate",
                    sourceEnvelopeId: primary.linearEnvelope.envelopeId,
                },
            ],
        }), /missing, unknown, or ambiguous/);
    });
    (0, node_test_1.it)("rejects body, coverage-only, dangling, duplicate, and malformed semantic proposals", () => {
        const cases = [
            {
                name: "body evidence",
                mutate: (brain) => {
                    brain.tasks[1].evidenceEventIds = ["event-oura-body"];
                },
                pattern: /body-derived|frozen harness semantic gates/,
            },
            {
                name: "dangling root",
                mutate: (brain) => {
                    brain.tasks[1].rootProposalId = "missing-root";
                },
                pattern: /dangling root/,
            },
            {
                name: "duplicate proposal ID",
                mutate: (brain) => {
                    brain.tasks[1].proposalId = brain.roots[0].proposalId;
                },
                pattern: /reused across kinds/,
            },
            {
                name: "bad edge endpoint",
                mutate: (brain) => {
                    brain.edges[1].toProposalId = "missing-task";
                },
                pattern: /endpoint is invalid/,
            },
            {
                name: "empty evidence",
                mutate: (brain) => {
                    brain.tasks[1].evidenceEventIds = [];
                },
                pattern: /cannot be empty/,
            },
            {
                name: "invalid confidence",
                mutate: (brain) => {
                    brain.tasks[1].confidence = 2;
                },
                pattern: /between zero and one/,
            },
            {
                name: "coverage event excluded from semantic input",
                mutate: (brain, input) => {
                    input.events.push({
                        id: "event-coverage",
                        pointerId: "granola-candidate",
                        recordKind: "work_context",
                        activity: "context_observed",
                        occurredAt: "2026-07-28T11:00:00.000Z",
                        observedAt: GENERATED_AT,
                        objectRefs: ["coverage:granola"],
                        title: "Coverage receipt",
                        summary: "Not semantic evidence.",
                        extractionConfidence: 1,
                        corpusCoverage: "complete",
                    });
                    brain.inputDigest = (0, harness_js_1.taskMapSemanticInputDigest)(input);
                    brain.roots[0].evidenceEventIds.push("event-coverage");
                },
                pattern: /missing or body-derived evidence/,
            },
        ];
        for (const testCase of cases) {
            const brain = clone(primary.brain);
            const input = clone(primary.input);
            testCase.mutate(brain, input);
            const artifact = (0, source_contracts_js_1.attestTaskMapSemanticBrain)(primary.snapshot.semanticInputDigest, brain, BRAIN_KEY);
            node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.buildTaskMapCandidateEvidenceBridge)({
                taskMapInput: input,
                sourceSnapshot: primary.snapshot,
                semanticBrainArtifact: artifact,
                semanticBrainAttestationKey: BRAIN_KEY,
                bridgeAttestationKey: BRIDGE_KEY,
                reviewedMappings: primary.reviewedMappings,
            }), testCase.pattern, testCase.name);
        }
    });
    (0, node_test_1.it)("enforces exact source kind, object, revision, and object-type compatibility without treating eventTime as identity", () => {
        node_assert_1.default.doesNotThrow(() => (0, candidate_review_companion_js_1.buildTaskMapCandidateEvidenceBridge)({
            taskMapInput: primary.input,
            sourceSnapshot: primary.snapshot,
            semanticBrainArtifact: primary.brainArtifact,
            semanticBrainAttestationKey: BRAIN_KEY,
            bridgeAttestationKey: BRIDGE_KEY,
            reviewedMappings: primary.reviewedMappings,
        }));
        node_assert_1.default.notStrictEqual(primary.input.events[0].occurredAt, primary.linearEnvelope.eventTime);
        node_assert_1.default.notStrictEqual(primary.input.events[1].occurredAt, primary.granolaEnvelope.eventTime);
        const missingRevision = clone(primary.input);
        delete missingRevision.pointers[1].sourceVersion;
        const missingRevisionBrain = clone(primary.brain);
        missingRevisionBrain.inputDigest =
            (0, harness_js_1.taskMapSemanticInputDigest)(missingRevision);
        const missingRevisionArtifact = (0, source_contracts_js_1.attestTaskMapSemanticBrain)(primary.snapshot.semanticInputDigest, missingRevisionBrain, BRAIN_KEY);
        node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.buildTaskMapCandidateEvidenceBridge)({
            taskMapInput: missingRevision,
            sourceSnapshot: primary.snapshot,
            semanticBrainArtifact: missingRevisionArtifact,
            semanticBrainAttestationKey: BRAIN_KEY,
            bridgeAttestationKey: BRIDGE_KEY,
            reviewedMappings: primary.reviewedMappings,
        }), /lacks an exact source revision/);
        const wrongRevision = clone(primary.input);
        wrongRevision.pointers[1].sourceVersion = "granola-revision-v2";
        const wrongRevisionBrain = clone(primary.brain);
        wrongRevisionBrain.inputDigest =
            (0, harness_js_1.taskMapSemanticInputDigest)(wrongRevision);
        const wrongRevisionArtifact = (0, source_contracts_js_1.attestTaskMapSemanticBrain)(primary.snapshot.semanticInputDigest, wrongRevisionBrain, BRAIN_KEY);
        node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.buildTaskMapCandidateEvidenceBridge)({
            taskMapInput: wrongRevision,
            sourceSnapshot: primary.snapshot,
            semanticBrainArtifact: wrongRevisionArtifact,
            semanticBrainAttestationKey: BRAIN_KEY,
            bridgeAttestationKey: BRIDGE_KEY,
            reviewedMappings: primary.reviewedMappings,
        }), /exactly one source envelope/);
    });
    (0, node_test_1.it)("keeps bridge and candidate membership stable across body-only origins", async () => {
        const second = await productFixture("body-b");
        cleanup.push(second.base);
        node_assert_1.default.notStrictEqual(primary.snapshot.sourceSnapshotDigest, second.snapshot.sourceSnapshotDigest);
        node_assert_1.default.strictEqual(primary.snapshot.semanticInputDigest, second.snapshot.semanticInputDigest);
        node_assert_1.default.notStrictEqual((0, harness_js_1.taskMapInputDigest)(primary.input), (0, harness_js_1.taskMapInputDigest)(second.input));
        node_assert_1.default.strictEqual((0, harness_js_1.taskMapSemanticInputDigest)(primary.input), (0, harness_js_1.taskMapSemanticInputDigest)(second.input));
        node_assert_1.default.notStrictEqual((0, harness_js_1.taskMapInputDigest)(primary.input), (0, harness_js_1.taskMapSemanticInputDigest)(primary.input));
        node_assert_1.default.deepStrictEqual(second.bridge, primary.bridge);
        const firstBuilt = await (0, candidate_review_companion_js_1.buildTaskMapCandidateReviewCompanion)(buildInput(primary));
        const secondBuilt = await (0, candidate_review_companion_js_1.buildTaskMapCandidateReviewCompanion)(buildInput(second));
        node_assert_1.default.notStrictEqual(firstBuilt.artifact.originDigest, secondBuilt.artifact.originDigest);
        node_assert_1.default.notStrictEqual(firstBuilt.artifact.artifactId, secondBuilt.artifact.artifactId);
        node_assert_1.default.deepStrictEqual(secondBuilt.artifact.reviewNext, firstBuilt.artifact.reviewNext);
    });
});
(0, node_test_1.describe)("P10.3b cryptographic, privacy, and hostile-input closure", () => {
    (0, node_test_1.it)("separates brain, bridge, artifact, candidate, group, and evidence domains", async () => {
        node_assert_1.default.notStrictEqual(BRAIN_KEY, BRIDGE_KEY);
        node_assert_1.default.notStrictEqual(primary.brainArtifact.attestationKeyId, primary.bridge.attestationKeyId);
        node_assert_1.default.notStrictEqual(primary.brainArtifact.attestationMac, primary.bridge.attestationMac);
        const built = await (0, candidate_review_companion_js_1.buildTaskMapCandidateReviewCompanion)(buildInput(primary));
        const row = built.artifact.reviewNext[0];
        const candidateSuffix = row.candidateId.slice("tmcandidate_".length);
        const groupSuffix = row.candidateGroupId.slice("tmcandidategroup_".length);
        const evidenceSuffix = row.evidenceIds[0].slice("tmcandidateevidence_".length);
        node_assert_1.default.notStrictEqual(candidateSuffix, groupSuffix);
        node_assert_1.default.notStrictEqual(candidateSuffix, evidenceSuffix);
        node_assert_1.default.notStrictEqual(groupSuffix, evidenceSuffix);
        node_assert_1.default.notStrictEqual(built.artifact.attestationMac, primary.bridge.attestationMac);
    });
    (0, node_test_1.it)("fails wrong, reused, swapped, tampered, and coordinated-rehash bridge proofs", () => {
        node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.assertTaskMapCandidateEvidenceBridge)(primary.bridge, WRONG_KEY), /attestation or identity is invalid/);
        node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.buildTaskMapCandidateEvidenceBridge)({
            taskMapInput: primary.input,
            sourceSnapshot: primary.snapshot,
            semanticBrainArtifact: primary.brainArtifact,
            semanticBrainAttestationKey: BRAIN_KEY,
            bridgeAttestationKey: BRAIN_KEY,
            reviewedMappings: primary.reviewedMappings,
        }), /must be distinct/);
        const reusedBrainMac = clone(primary.bridge);
        reusedBrainMac.attestationMac =
            primary.brainArtifact.attestationMac;
        node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.assertTaskMapCandidateEvidenceBridge)(coordinatedBridgeRehash(reusedBrainMac), BRIDGE_KEY), /attestation or identity is invalid/);
        const tokenSwap = clone(primary.bridge);
        tokenSwap.evidenceMappings[0].eventToken =
            `tmcandidateevent_${tokenSwap.evidenceMappings[0].envelopeToken
                .slice("tmcandidateenvelope_".length)}`;
        node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.assertTaskMapCandidateEvidenceBridge)(coordinatedBridgeRehash(tokenSwap), BRIDGE_KEY), /attestation or identity is invalid|duplicated or unsorted/);
        const tampered = clone(primary.bridge);
        tampered.brainOutputDigest = digest("tampered-brain-output");
        node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.assertTaskMapCandidateEvidenceBridge)(coordinatedBridgeRehash(tampered), BRIDGE_KEY), /attestation or identity is invalid/);
    });
    (0, node_test_1.it)("separates semantic and bridge keys by exact UTF-8 bytes, not JavaScript string identity", async () => {
        const keyA = `${"x".repeat(32)}\ud800`;
        const keyB = `${"x".repeat(32)}\ud801`;
        node_assert_1.default.notStrictEqual(keyA, keyB);
        node_assert_1.default.deepStrictEqual(Buffer.from(keyA, "utf8"), Buffer.from(keyB, "utf8"));
        const brainArtifact = (0, source_contracts_js_1.attestTaskMapSemanticBrain)(primary.snapshot.semanticInputDigest, primary.brain, keyA);
        node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.buildTaskMapCandidateEvidenceBridge)({
            taskMapInput: primary.input,
            sourceSnapshot: primary.snapshot,
            semanticBrainArtifact: brainArtifact,
            semanticBrainAttestationKey: keyA,
            bridgeAttestationKey: keyB,
            reviewedMappings: primary.reviewedMappings,
        }), /must be distinct/);
        const product = buildInput(primary);
        product.companion = {
            sourceSnapshot: primary.snapshot,
            semanticBrainArtifact: brainArtifact,
            semanticBrainAttestationKey: keyA,
            // Deliberately unrelated proof: the bytewise separation gate must fail
            // before either bridge verification or the authenticated P10.3a await.
            evidenceBridge: primary.bridge,
            bridgeAttestationKey: keyB,
        };
        let afterWorkControlCalls = 0;
        await node_assert_1.default.rejects((0, candidate_review_companion_js_1.unsafeBuildTaskMapCandidateReviewCompanionWithAfterWorkControlStartedForTest)(product, () => {
            afterWorkControlCalls += 1;
        }), /must be distinct/);
        node_assert_1.default.strictEqual(afterWorkControlCalls, 0);
    });
    (0, node_test_1.it)("requires the artifact HMAC for standalone canonical validation and rejects swapped rows after outer rehash", async () => {
        const built = await (0, candidate_review_companion_js_1.buildTaskMapCandidateReviewCompanion)(buildInput(primary));
        node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.assertTaskMapCandidateReviewCompanion)(built.artifact), /artifact attestation key/);
        node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.assertTaskMapCandidateReviewCompanion)(built.artifact, WRONG_KEY), /artifact attestation is invalid/);
        const swappedGroup = clone(built.artifact);
        swappedGroup.reviewNext[0].candidateGroupId =
            `tmcandidategroup_${swappedGroup.reviewNext[0].candidateId
                .slice("tmcandidate_".length)}`;
        node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.assertTaskMapCandidateReviewCompanion)(coordinatedArtifactRehash(swappedGroup), BRIDGE_KEY), /artifact attestation is invalid/);
        const swappedEvidence = clone(built.artifact);
        swappedEvidence.reviewNext[0].evidenceIds[0] =
            `tmcandidateevidence_${swappedEvidence.reviewNext[0].candidateId
                .slice("tmcandidate_".length)}`;
        node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.assertTaskMapCandidateReviewCompanion)(coordinatedArtifactRehash(swappedEvidence), BRIDGE_KEY), /artifact attestation is invalid/);
    });
    (0, node_test_1.it)("binds full, harness-semantic, source-semantic, and exact P10.3a domains separately", async () => {
        const wrongFull = buildInput(primary);
        wrongFull.taskMapInput = clone(primary.input);
        wrongFull.taskMapInput.events[1].title = "Changed full input";
        await node_assert_1.default.rejects((0, candidate_review_companion_js_1.buildTaskMapCandidateReviewCompanion)(wrongFull), /full input, projection, and work-control domains are misbound/);
        const wrongBrain = clone(primary.brain);
        wrongBrain.inputDigest = digest("wrong-harness-semantic-input");
        const wrongBrainArtifact = (0, source_contracts_js_1.attestTaskMapSemanticBrain)(primary.snapshot.semanticInputDigest, wrongBrain, BRAIN_KEY);
        node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.buildTaskMapCandidateEvidenceBridge)({
            taskMapInput: primary.input,
            sourceSnapshot: primary.snapshot,
            semanticBrainArtifact: wrongBrainArtifact,
            semanticBrainAttestationKey: BRAIN_KEY,
            bridgeAttestationKey: BRIDGE_KEY,
            reviewedMappings: primary.reviewedMappings,
        }), /semantic brain, harness, and source digest domains are misbound|frozen harness semantic gates/);
        const changedGranola = (0, source_contracts_js_1.buildTaskMapSourceEnvelope)({
            ownerScopeDigest: OWNER_SCOPE_DIGEST,
            binding: GRANOLA_BINDING,
            sourceKind: "granola",
            objectType: "meeting_note",
            sourceObjectId: "granola-meeting-note",
            sourceRevision: "granola-revision-v1",
            eventTime: primary.granolaEnvelope.eventTime,
            contentDigest: digest("changed-granola-content"),
            authority: primary.granolaEnvelope.authority,
            meetingIdentity: primary.granolaEnvelope.meetingIdentity,
        });
        const changedSnapshot = (0, source_contracts_js_1.buildTaskMapSourceSnapshot)([
            primary.linearEnvelope,
            changedGranola,
            primary.ouraEnvelope,
        ], []);
        node_assert_1.default.notStrictEqual(changedSnapshot.semanticInputDigest, primary.snapshot.semanticInputDigest);
        const changedBrainArtifact = (0, source_contracts_js_1.attestTaskMapSemanticBrain)(changedSnapshot.semanticInputDigest, primary.brain, BRAIN_KEY);
        const changedBridge = (0, candidate_review_companion_js_1.buildTaskMapCandidateEvidenceBridge)({
            taskMapInput: primary.input,
            sourceSnapshot: changedSnapshot,
            semanticBrainArtifact: changedBrainArtifact,
            semanticBrainAttestationKey: BRAIN_KEY,
            bridgeAttestationKey: BRIDGE_KEY,
            reviewedMappings: [
                primary.reviewedMappings[0],
                {
                    eventId: "event-granola-candidate",
                    sourceEnvelopeId: changedGranola.envelopeId,
                },
            ],
        });
        const wrongSource = buildInput(primary);
        wrongSource.companion = {
            sourceSnapshot: changedSnapshot,
            semanticBrainArtifact: changedBrainArtifact,
            semanticBrainAttestationKey: BRAIN_KEY,
            evidenceBridge: changedBridge,
            bridgeAttestationKey: BRIDGE_KEY,
        };
        await node_assert_1.default.rejects((0, candidate_review_companion_js_1.buildTaskMapCandidateReviewCompanion)(wrongSource), /exact predecessor evidence set/);
        const wrongP103a = buildInput(primary);
        wrongP103a.workControlDecision = clone(primary.workControl);
        wrongP103a.workControlDecision.artifactDigest = "0".repeat(64);
        await node_assert_1.default.rejects((0, candidate_review_companion_js_1.buildTaskMapCandidateReviewCompanion)(wrongP103a), /canonical-core-derived|exact store-backed result/);
    });
    (0, node_test_1.it)("keeps retained bytes free of text, raw IDs, routes, accepted-work IDs, and body material", async () => {
        const built = await (0, candidate_review_companion_js_1.buildTaskMapCandidateReviewCompanion)(buildInput(primary));
        const bytes = `${JSON.stringify(primary.bridge)}\n${built.canonicalBytes}`;
        for (const forbidden of [
            "\"title\"",
            "\"summary\"",
            "\"memberObjectRefs\"",
            "\"rootId\"",
            "\"workId\"",
            "\"openState\"",
            "\"confidence\"",
            "\"priority\"",
            "\"rank\"",
            "\"returnRoute\"",
            "\"authoritativeTaskEventId\"",
            "event-granola-candidate",
            primary.granolaEnvelope.envelopeId,
            "proposal-candidate",
            "granola-meeting-note",
            "Private relative body context",
            "below_baseline",
            "\"bodyAxis\"",
            "\"bodyCategory\"",
        ]) {
            node_assert_1.default.ok(!bytes.includes(forbidden), forbidden);
        }
        node_assert_1.default.ok(bytes.includes("\"candidateTextStored\":false"));
        node_assert_1.default.ok(bytes.includes("\"rawBiometricsStored\":false"));
    });
    (0, node_test_1.it)("rejects accessors, proxies, symbols, custom prototypes, holes, named arrays, excessive width/depth/strings, and undefined companion before helpers", async () => {
        const baseBridgeInput = {
            taskMapInput: primary.input,
            sourceSnapshot: primary.snapshot,
            semanticBrainArtifact: primary.brainArtifact,
            semanticBrainAttestationKey: BRAIN_KEY,
            bridgeAttestationKey: BRIDGE_KEY,
            reviewedMappings: primary.reviewedMappings,
        };
        let getterCalls = 0;
        const accessor = { ...baseBridgeInput };
        Object.defineProperty(accessor, "reviewedMappings", {
            enumerable: true,
            get() {
                getterCalls += 1;
                return primary.reviewedMappings;
            },
        });
        node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.buildTaskMapCandidateEvidenceBridge)(accessor), /enumerable data properties/);
        node_assert_1.default.strictEqual(getterCalls, 0);
        node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.buildTaskMapCandidateEvidenceBridge)(new Proxy(baseBridgeInput, {})), /proxy/);
        const symbol = { ...baseBridgeInput };
        symbol[Symbol("secret")] = "hidden";
        node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.buildTaskMapCandidateEvidenceBridge)(symbol), /symbol key/);
        const custom = Object.create({ inherited: true });
        Object.assign(custom, baseBridgeInput);
        node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.buildTaskMapCandidateEvidenceBridge)(custom), /plain or null prototype/);
        const hole = clone(primary.reviewedMappings);
        delete hole[0];
        node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.buildTaskMapCandidateEvidenceBridge)({
            ...baseBridgeInput,
            reviewedMappings: hole,
        }), /holes or named fields/);
        const named = clone(primary.reviewedMappings);
        named.named = "not-json-array";
        node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.buildTaskMapCandidateEvidenceBridge)({
            ...baseBridgeInput,
            reviewedMappings: named,
        }), /holes or named fields/);
        const wide = clone(baseBridgeInput);
        for (let index = 0; index <= candidate_review_companion_js_1.TASKMAP_CANDIDATE_REVIEW_LIMITS_V1.maxObjectKeys; index += 1) {
            Object.defineProperty(wide, `undefined-${index}`, {
                enumerable: true,
                configurable: true,
                value: undefined,
            });
        }
        node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.buildTaskMapCandidateEvidenceBridge)(wide), /object-key ceiling/);
        const deep = clone(baseBridgeInput);
        let cursor = {};
        deep.rogue = cursor;
        for (let index = 0; index <= candidate_review_companion_js_1.TASKMAP_CANDIDATE_REVIEW_LIMITS_V1.maxDepth; index += 1) {
            const next = {};
            cursor.next = next;
            cursor = next;
        }
        node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.buildTaskMapCandidateEvidenceBridge)(deep), /depth ceiling/);
        const oversized = clone(baseBridgeInput);
        oversized.semanticBrainArtifact.brain.tasks[1].title =
            "x".repeat(candidate_review_companion_js_1.TASKMAP_CANDIDATE_REVIEW_LIMITS_V1.maxStringLength + 1);
        node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.buildTaskMapCandidateEvidenceBridge)(oversized), /string ceiling/);
        const explicitUndefined = buildInput(primary);
        explicitUndefined.companion = undefined;
        await node_assert_1.default.rejects((0, candidate_review_companion_js_1.buildTaskMapCandidateReviewCompanion)(explicitUndefined), /undefined data property/);
    });
    (0, node_test_1.it)("fails closed when a runtime static intrinsic changes during the authenticated await", async () => {
        const originalKeys = Object.keys;
        try {
            await node_assert_1.default.rejects((0, candidate_review_companion_js_1.unsafeBuildTaskMapCandidateReviewCompanionWithAfterWorkControlStartedForTest)(buildInput(primary), () => {
                Object.keys = (() => []);
            }), /runtime static intrinsics|P10\.3a|P10\.2/);
        }
        finally {
            Object.keys = originalKeys;
        }
        node_assert_1.default.deepStrictEqual(Object.keys({ a: 1 }), ["a"]);
    });
    (0, node_test_1.it)("holds CommonJS crypto and work-control callable receipts across the authenticated await", async () => {
        const forwardingCallable = (original) => (...args) => Reflect.apply(original, undefined, args);
        const mutations = [
            {
                label: "createHmac",
                install: () => {
                    const original = MUTABLE_CRYPTO_EXPORTS.createHmac;
                    MUTABLE_CRYPTO_EXPORTS.createHmac = forwardingCallable(original);
                    return () => {
                        MUTABLE_CRYPTO_EXPORTS.createHmac = original;
                    };
                },
            },
            {
                label: "createHash",
                install: () => {
                    const original = MUTABLE_CRYPTO_EXPORTS.createHash;
                    MUTABLE_CRYPTO_EXPORTS.createHash = forwardingCallable(original);
                    return () => {
                        MUTABLE_CRYPTO_EXPORTS.createHash = original;
                    };
                },
            },
            {
                label: "timingSafeEqual",
                install: () => {
                    const original = MUTABLE_CRYPTO_EXPORTS.timingSafeEqual;
                    MUTABLE_CRYPTO_EXPORTS.timingSafeEqual = forwardingCallable(original);
                    return () => {
                        MUTABLE_CRYPTO_EXPORTS.timingSafeEqual = original;
                    };
                },
            },
            {
                label: "work-control canonical helper",
                install: () => {
                    const original = MUTABLE_WORK_CONTROL_EXPORTS
                        .taskMapWorkControlDecisionCanonicalBytes;
                    MUTABLE_WORK_CONTROL_EXPORTS
                        .taskMapWorkControlDecisionCanonicalBytes =
                        forwardingCallable(original);
                    return () => {
                        MUTABLE_WORK_CONTROL_EXPORTS
                            .taskMapWorkControlDecisionCanonicalBytes = original;
                    };
                },
            },
            {
                label: "work-control builder",
                install: () => {
                    const original = MUTABLE_WORK_CONTROL_EXPORTS.buildTaskMapWorkControlDecision;
                    MUTABLE_WORK_CONTROL_EXPORTS.buildTaskMapWorkControlDecision =
                        forwardingCallable(original);
                    return () => {
                        MUTABLE_WORK_CONTROL_EXPORTS
                            .buildTaskMapWorkControlDecision = original;
                    };
                },
            },
        ];
        for (const mutation of mutations) {
            let restore = () => { };
            let hookCalls = 0;
            try {
                await node_assert_1.default.rejects((0, candidate_review_companion_js_1.unsafeBuildTaskMapCandidateReviewCompanionWithAfterWorkControlStartedForTest)(buildInput(primary), () => {
                    hookCalls += 1;
                    restore = mutation.install();
                }), /runtime module callables changed/, mutation.label);
            }
            finally {
                restore();
            }
            node_assert_1.default.strictEqual(hookCalls, 1, mutation.label);
        }
        const healthy = await (0, candidate_review_companion_js_1.buildTaskMapCandidateReviewCompanion)(buildInput(primary));
        node_assert_1.default.strictEqual((0, candidate_review_companion_js_1.taskMapCandidateReviewCompanionCanonicalBytes)(healthy.artifact, BRIDGE_KEY), healthy.canonicalBytes);
    });
    (0, node_test_1.it)("holds complete Hash and Hmac prototype receipts across the authenticated await", async () => {
        const cases = [
            {
                label: "Hash",
                prototype: Object.getPrototypeOf((0, node_crypto_1.createHash)("sha256")),
            },
            {
                label: "Hmac",
                prototype: Object.getPrototypeOf((0, node_crypto_1.createHmac)("sha256", "prototype-test-key")),
            },
        ];
        for (const testCase of cases) {
            const descriptor = Object.getOwnPropertyDescriptor(testCase.prototype, "digest");
            node_assert_1.default.ok(descriptor);
            node_assert_1.default.strictEqual(typeof descriptor.value, "function");
            const originalDigest = descriptor.value;
            try {
                await node_assert_1.default.rejects((0, candidate_review_companion_js_1.unsafeBuildTaskMapCandidateReviewCompanionWithAfterWorkControlStartedForTest)(buildInput(primary), () => {
                    Object.defineProperty(testCase.prototype, "digest", {
                        ...descriptor,
                        value: function wrappedDigest(...args) {
                            return Reflect.apply(originalDigest, this, args);
                        },
                    });
                }), new RegExp(`${testCase.label} prototype changed`));
            }
            finally {
                Object.defineProperty(testCase.prototype, "digest", descriptor);
            }
        }
        const healthy = await (0, candidate_review_companion_js_1.buildTaskMapCandidateReviewCompanion)(buildInput(primary));
        node_assert_1.default.strictEqual(healthy.artifact.reviewNext.length, 1);
    });
    (0, node_test_1.it)("rejects a mutated proxy detector before invoking any proxy trap", () => {
        const mutableUtilTypes = node_util_1.types;
        const originalIsProxy = mutableUtilTypes.isProxy;
        let trapCount = 0;
        const trapped = new Proxy({
            taskMapInput: primary.input,
            sourceSnapshot: primary.snapshot,
            semanticBrainArtifact: primary.brainArtifact,
            semanticBrainAttestationKey: BRAIN_KEY,
            bridgeAttestationKey: BRIDGE_KEY,
            reviewedMappings: primary.reviewedMappings,
        }, {
            getPrototypeOf(target) {
                trapCount += 1;
                return Reflect.getPrototypeOf(target);
            },
            ownKeys(target) {
                trapCount += 1;
                return Reflect.ownKeys(target);
            },
        });
        try {
            mutableUtilTypes.isProxy = () => false;
            node_assert_1.default.throws(() => (0, candidate_review_companion_js_1.buildTaskMapCandidateEvidenceBridge)(trapped), /runtime static intrinsics/);
            node_assert_1.default.strictEqual(trapCount, 0);
        }
        finally {
            mutableUtilTypes.isProxy = originalIsProxy;
        }
    });
});
