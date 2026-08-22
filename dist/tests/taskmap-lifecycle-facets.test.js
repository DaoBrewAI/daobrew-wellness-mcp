"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = __importDefault(require("node:assert"));
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const harness_js_1 = require("../src/engine/taskmap/harness.js");
const identity_dedupe_projection_js_1 = require("../src/engine/taskmap/identity-dedupe-projection.js");
const lifecycle_facets_js_1 = require("../src/engine/taskmap/lifecycle-facets.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const refresh_plan_js_1 = require("../src/engine/taskmap/refresh-plan.js");
const refresh_run_bundle_js_1 = require("../src/engine/taskmap/refresh-run-bundle.js");
const refresh_current_ref_js_1 = require("../src/engine/taskmap/refresh-current-ref.js");
const work_control_decision_js_1 = require("../src/engine/taskmap/work-control-decision.js");
const types_js_1 = require("../src/engine/taskmap/types.js");
const GENERATED_AT = "2026-07-28T12:00:00.000Z";
const GENERATION = "00000000000000000001";
const digest = (label) => (0, source_contracts_js_1.taskMapContractDigest)({ domain: "p11.1b-lifecycle-facets-test", label });
const OWNER_SCOPE_DIGEST = digest("owner");
const ZERO_SCORE = {
    sourcePriority: 0,
    deadlinePressure: 0,
    dependencyImpact: 0,
    recurrence: 0,
    staleOpen: 0,
    evidenceStrength: 0,
    bodyBonus: 0,
    total: 0,
};
function clone(value) {
    return structuredClone(value);
}
function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
function workId(label) {
    return `tmwork_${digest(`work:${label}`)}`;
}
function projectionFixture(cases) {
    const input = {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
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
    const brain = {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        provider: "synthetic-brain",
        model: "synthetic-model",
        promptHash: "aaaaaaaaaaaaaaaa",
        inputDigest: (0, harness_js_1.taskMapSemanticInputDigest)(input),
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
    const projection = JSON.parse(JSON.stringify((0, harness_js_1.buildTaskMapProjection)(input, brain, {
        arm: "E4",
        now: GENERATED_AT,
    })));
    for (const row of cases) {
        const task = projection.tasks.find((candidate) => (candidate.title === `Work ${row.label}`));
        node_assert_1.default.ok(task);
        if (row.currentState === "resolved") {
            task.reviewState = "source_complete";
            task.openState = "completed";
            task.score = { ...ZERO_SCORE };
            task.whyNow = [];
        }
        else if (row.currentState === "superseded") {
            task.reviewState = "superseded";
            task.openState = "superseded";
            task.score = { ...ZERO_SCORE };
            task.whyNow = [];
        }
        else if (row.currentState === "rejected") {
            projection.tasks = projection.tasks.filter((candidate) => candidate.id !== task.id);
            projection.roots[0].taskIds = projection.roots[0].taskIds.filter((taskId) => taskId !== task.id);
            projection.edges = projection.edges.filter((edge) => edge.from !== task.id && edge.to !== task.id);
            projection.rejections.push({
                proposalId: `Rejected-${row.label}`,
                kind: "task",
                reasons: ["synthetic rejected work"],
            });
        }
        else {
            task.reviewState = "accepted";
            task.openState = "open";
        }
    }
    return projection;
}
function fixtureFor(cases, mutate) {
    const projection = projectionFixture(cases);
    const projectionDigest = (0, source_contracts_js_1.diffTaskMapProjections)(null, projection).currentProjectionDigest;
    const currentRefId = `tmrefreshcurrent_${digest("current-ref")}`;
    const acceptedOriginBundleId = `tmrefreshrun_${digest("bundle")}`;
    const replayClosure = {
        contractVersion: identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_REPLAY_CLOSURE_VERSION,
        ownerScopeDigest: OWNER_SCOPE_DIGEST,
        sourceSnapshotDigest: digest("source-snapshot"),
        sourceSemanticInputDigest: digest("source-semantic-input"),
        projectionDigest,
        projectionRunId: projection.runId,
        projectionInputDigest: projection.inputDigest,
        suppliedIdentityProofDigest: digest("identity-proof"),
        semanticRowsDigest: digest("semantic-rows"),
    };
    const replayClosureDigest = (0, source_contracts_js_1.taskMapContractDigest)(replayClosure);
    const works = [];
    const events = [];
    const lifecycleDeltas = [];
    for (const row of cases) {
        const id = workId(row.label);
        const currentSourceIdentityDigest = digest(`identity:${row.label}:current`);
        const previousSourceIdentityDigest = row.previousState === "absent"
            ? undefined
            : (row.adjudicatedDelta === "updated"
                ? digest(`identity:${row.label}:previous`)
                : currentSourceIdentityDigest);
        const adjudicationDigest = digest(`adjudication:${row.label}`);
        const lifecycleEventCore = {
            workId: id,
            sourceIdentityDigest: currentSourceIdentityDigest,
            lifecycleState: row.currentState,
            adjudicationDigest,
        };
        const lifecycleEventId = `tmlifecycleevent_${(0, source_contracts_js_1.taskMapContractDigest)(lifecycleEventCore)}`;
        const projectionReferences = [];
        if (row.currentState === "rejected") {
            const rejection = projection.rejections.find((candidate) => (candidate.proposalId === `Rejected-${row.label}`));
            node_assert_1.default.ok(rejection);
            const projectionRowDigest = (0, source_contracts_js_1.taskMapContractDigest)(rejection);
            projectionReferences.push({
                kind: "rejection",
                id: `tmprojectionref_${(0, source_contracts_js_1.taskMapContractDigest)({
                    kind: "rejection",
                    projectionRowDigest,
                })}`,
                projectionRowDigest,
            });
        }
        else {
            const task = projection.tasks.find((candidate) => (candidate.title === `Work ${row.label}`));
            node_assert_1.default.ok(task);
            const projectionRowDigest = (0, source_contracts_js_1.taskMapContractDigest)(task);
            projectionReferences.push({
                kind: "task",
                id: `tmprojectionref_${(0, source_contracts_js_1.taskMapContractDigest)({
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
            deltaId: `tmlifecycledelta_${(0, source_contracts_js_1.taskMapContractDigest)(deltaCore)}`,
            ...deltaCore,
        });
    }
    works.sort((left, right) => compareText(left.workId, right.workId));
    events.sort((left, right) => compareText(left.eventId, right.eventId));
    lifecycleDeltas.sort((left, right) => compareText(left.deltaId, right.deltaId));
    const sidecarId = `tmidentityprojection_${digest(`sidecar:${projectionDigest}`)}`;
    const sidecar = {
        contractVersion: identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_PROJECTION_VERSION,
        sidecarId,
        ownerScopeDigest: OWNER_SCOPE_DIGEST,
        policyVersion: identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_POLICY_VERSION,
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
            sourceSnapshotProofId: `tmrefreshsnapshotproof_${digest("source-snapshot-proof")}`,
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
    const sidecarDigest = (0, source_contracts_js_1.taskMapContractDigest)(sidecar);
    const diff = {
        contractVersion: identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_DIFF_VERSION,
        diffId: `tmidentitydiff_${digest("diff")}`,
        previousSidecarDigest: (0, source_contracts_js_1.taskMapContractDigest)(null),
        currentSidecarDigest: sidecarDigest,
        added: [],
        removed: [],
        changed: [],
    };
    const entry = {
        contractVersion: identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_STORE_ENTRY_VERSION,
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
        acceptedOriginReplayDigest: sidecar.origin.acceptedOriginReplayDigest,
        replayClosureDigest,
        sidecarId,
        sidecarDigest,
        diffId: diff.diffId,
        diffDigest: (0, source_contracts_js_1.taskMapContractDigest)(diff),
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
        entry.sidecarDigest = (0, source_contracts_js_1.taskMapContractDigest)(entry.sidecar);
        entry.semanticHead = {
            generation: entry.generation,
            currentRefId: entry.currentRefId,
            sidecarId: entry.sidecarId,
            sidecarDigest: entry.sidecarDigest,
        };
        entry.diff.currentSidecarDigest = entry.sidecarDigest;
        entry.diffDigest = (0, source_contracts_js_1.taskMapContractDigest)(entry.diff);
    }
    const store = {
        entries: [entry],
        canonicalByteLength: Buffer.byteLength(JSON.stringify(entry), "utf8"),
        remainingByteCapacity: 1,
    };
    const workControl = (0, work_control_decision_js_1.unsafeBuildTaskMapWorkControlDecisionFromAuthenticatedP10_2ForTest)({
        firstStore: store,
        secondStore: store,
        projection,
    }).artifact;
    return { projection, entry, store, workControl };
}
function build(fixture) {
    return (0, lifecycle_facets_js_1.unsafeBuildTaskMapLifecycleFacetsFromAuthenticatedFixturesForTest)({
        firstStore: fixture.store,
        secondStore: fixture.store,
        projection: fixture.projection,
        workControl: fixture.workControl,
    });
}
function canonicalJson(value) {
    if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(",")}]`;
    }
    if (value !== null && typeof value === "object") {
        return `{${Object.keys(value)
            .sort(compareText)
            .map((key) => (`${JSON.stringify(key)}:${canonicalJson(value[key])}`))
            .join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}
function coordinatedRehash(artifact) {
    const { artifactId: _artifactId, artifactDigest: _artifactDigest, ...core } = artifact;
    const artifactDigest = createDigest(core);
    return {
        ...artifact,
        artifactId: `tmlifecyclefacets_${artifactDigest}`,
        artifactDigest,
    };
}
function coordinatedRehashWorkControl(artifact) {
    artifact.originDigest = (0, source_contracts_js_1.taskMapContractDigest)(artifact.predecessor);
    const { artifactId: _artifactId, artifactDigest: _artifactDigest, ...core } = artifact;
    const artifactDigest = (0, source_contracts_js_1.taskMapContractDigest)(core);
    artifact.artifactId = `tmworkcontroldecision_${artifactDigest}`;
    artifact.artifactDigest = artifactDigest;
    return artifact;
}
function createDigest(value) {
    return (0, source_contracts_js_1.taskMapContractDigest)(JSON.parse(canonicalJson(value)));
}
function realPolicyBindings() {
    return [
        "identity",
        "normalization",
        "publication",
        "scheduling",
        "source",
    ].map((name) => ({
        name: `${name}-policy`,
        version: `${name}-policy.1`,
        digest: digest(`real-policy:${name}`),
    }));
}
function realRefreshLanes(bindingDigest) {
    const lane = (value) => ({
        contractVersion: refresh_plan_js_1.TASKMAP_REFRESH_LANE_VERSION,
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
function realSourceFixture(projection) {
    const binding = {
        connectionId: "synthetic-p111b-linear",
        sourceKind: "linear",
        tenantOrWorkspaceDigest: digest("real-workspace"),
        accountOrPrincipalDigest: digest("real-principal"),
        grantVersion: "synthetic-read-v1",
    };
    const envelopes = projection.tasks.map((task, index) => ((0, source_contracts_js_1.buildTaskMapSourceEnvelope)({
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
    })));
    return {
        snapshot: (0, source_contracts_js_1.buildTaskMapSourceSnapshot)(envelopes, []),
        binding,
        workBindings: projection.tasks.map((task, index) => ({
            projectionKind: "task",
            projectionId: task.id,
            sourceEnvelopeId: envelopes[index].envelopeId,
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
function prepareRealAcceptedOrigin(projection, source) {
    const bindingDigest = (0, source_contracts_js_1.taskMapContractDigest)(source.binding);
    const sourceRevisions = source.snapshot.envelopes.map((envelope) => ({
        bindingDigest,
        sourceIdentityDigest: envelope.sourceIdentityDigest,
        sourceRevisionDigest: (0, source_contracts_js_1.taskMapContractDigest)(envelope.sourceRevision),
        contentDigest: envelope.contentDigest,
    })).sort((left, right) => (left.sourceIdentityDigest.localeCompare(right.sourceIdentityDigest)));
    const reviewAttestationDigest = digest("real-review-attestation");
    const deterministicReplayDigest = (0, identity_dedupe_projection_js_1.taskMapIdentityDedupeReplayClosureDigest)(source.snapshot, projection, {
        aliases: [],
        workBindings: source.workBindings,
        sessionLineage: [],
        lifecycleAdjudications: source.lifecycleAdjudications,
    }, reviewAttestationDigest);
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
            truthSetDigest: digest("real-truth"),
            reviewBatchDigest: digest("real-review-batch"),
            reviewAttestationVersion: refresh_plan_js_1.TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION,
            reviewAttestationDigest,
            sourceManifestDigest: digest("real-source-manifest"),
        },
        sourceBindings: [{
                bindingDigest,
                sourceKind: "linear",
                sourceContractVersion: source.snapshot.envelopes[0].contractVersion,
                adapterVersion: "linear-adapter.1",
            }],
        sourceRevisions,
        sourceRevisionSets: [{
                bindingDigest,
                revisionSetDigest: (0, source_contracts_js_1.taskMapContractDigest)(sourceRevisions.map((revision) => ({
                    sourceIdentityDigest: revision.sourceIdentityDigest,
                    sourceRevisionDigest: revision.sourceRevisionDigest,
                    contentDigest: revision.contentDigest,
                }))),
            }],
        semanticInputDigests: [source.snapshot.semanticInputDigest],
        deterministicReplayDigest,
        policyBindings: realPolicyBindings(),
        lanes: realRefreshLanes(bindingDigest),
    };
    const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft);
    const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
        maxConcurrency: 4,
        laneStates: plan.lanes.map((lane) => ({
            laneId: lane.laneId,
            status: "succeeded",
        })),
    });
    node_assert_1.default.strictEqual(batch.publication.state, "complete");
    const checkpoint = (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(null, {
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
        acceptedSourceIdentityDigests: source.snapshot.envelopes
            .map((envelope) => envelope.sourceIdentityDigest)
            .sort(),
    });
    const sourceSlice = (0, refresh_run_bundle_js_1.buildTaskMapRefreshRunSourceSliceProof)({
        ownerScopeDigest: OWNER_SCOPE_DIGEST,
        bindingDigest,
        sourceRevisions,
        acceptedSourceIdentityDigests: checkpoint.acceptedSourceIdentityDigests,
    });
    return (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)({
        plan,
        batch,
        connectorCheckpoints: [checkpoint],
        attemptOutputs: [{
                laneId: "collect-0",
                checkpointDigest: (0, source_contracts_js_1.taskMapContractDigest)(checkpoint),
                sourceSliceDigest: sourceSlice.sourceSliceDigest,
            }],
        sourceSliceProofs: [sourceSlice],
        sourceSnapshot: source.snapshot,
    });
}
async function materializeRealProductFixture(parent, projection) {
    const currentRoot = node_path_1.default.join(parent, "current");
    const runRoot = node_path_1.default.join(parent, "run");
    const sidecarRoot = node_path_1.default.join(parent, "sidecar");
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
    const source = realSourceFixture(projection);
    const prepared = prepareRealAcceptedOrigin(projection, source);
    await (0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, prepared);
    await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
        currentRoot,
        runRoot,
        bundleId: prepared.bundleId,
        expectedGeneration: "00000000000000000000",
        options: {
            operationToken: "34".repeat(16),
        },
    });
    await (0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)({
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
const HAPPY_CASES = [
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
(0, node_test_1.describe)("P11.1b lifecycle facets", () => {
    (0, node_test_1.it)("builds a canonical mixed lifecycle artifact from P10.2 and P10.3a", () => {
        const fixture = fixtureFor(HAPPY_CASES);
        const built = build(fixture);
        node_assert_1.default.equal(built.artifact.contractVersion, lifecycle_facets_js_1.TASKMAP_LIFECYCLE_FACETS_VERSION);
        node_assert_1.default.equal(built.artifact.policyVersion, lifecycle_facets_js_1.TASKMAP_LIFECYCLE_FACETS_POLICY_VERSION);
        node_assert_1.default.equal(built.artifact.rows.length, 4);
        node_assert_1.default.deepEqual(new Set(built.artifact.rows.map((row) => row.lifecycle)), new Set(["accepted_open", "source_complete", "superseded", "rejected"]));
        node_assert_1.default.equal(built.artifact.rows.find((row) => row.change === "new")
            ?.newlyAcceptedOpen, true);
        const rejected = built.artifact.rows.find((row) => row.lifecycle === "rejected");
        node_assert_1.default.ok(rejected);
        node_assert_1.default.equal(rejected.rootId, null);
        node_assert_1.default.deepEqual(rejected.projectionTaskIds, []);
        node_assert_1.default.equal(built.canonicalBytes, (0, lifecycle_facets_js_1.taskMapLifecycleFacetsCanonicalBytes)(built.artifact));
        node_assert_1.default.ok(Object.isFrozen(built.artifact));
        node_assert_1.default.ok(Object.isFrozen(built.artifact.rows));
    });
    (0, node_test_1.it)("replays identical authenticated inputs byte-for-byte with sorted rows", () => {
        const fixture = fixtureFor([...HAPPY_CASES].reverse());
        const first = build(fixture);
        const second = build(clone(fixture));
        node_assert_1.default.equal(first.canonicalBytes, second.canonicalBytes);
        node_assert_1.default.equal(first.artifact.artifactId, second.artifact.artifactId);
        node_assert_1.default.deepEqual(first.artifact.rows.map((row) => row.workId), [...first.artifact.rows.map((row) => row.workId)].sort(compareText));
    });
    (0, node_test_1.it)("builds deterministically through the real authenticated P10.1/P10.2/P10.3a product path", async () => {
        const canonicalTmp = await (0, promises_1.realpath)((0, node_os_1.tmpdir)());
        const parent = await (0, promises_1.mkdtemp)(node_path_1.default.join(canonicalTmp, "p111b-product-path-"));
        await (0, promises_1.chmod)(parent, 0o700);
        const projection = projectionFixture([{
                label: "real-open",
                previousState: "absent",
                currentState: "open",
                adjudicatedDelta: "open",
            }]);
        try {
            const roots = await materializeRealProductFixture(parent, projection);
            const first = await (0, lifecycle_facets_js_1.buildTaskMapLifecycleFacets)({
                ...roots,
                projection,
            });
            const second = await (0, lifecycle_facets_js_1.buildTaskMapLifecycleFacets)({
                ...roots,
                projection,
            });
            node_assert_1.default.equal(first.canonicalBytes, second.canonicalBytes);
            node_assert_1.default.equal(first.artifact.artifactId, second.artifact.artifactId);
            node_assert_1.default.equal(first.artifact.rows.length, 1);
            node_assert_1.default.equal(first.artifact.rows[0].lifecycle, "accepted_open");
            node_assert_1.default.equal(first.artifact.rows[0].change, "new");
            node_assert_1.default.equal(first.artifact.rows[0].changedSinceLastRefresh, true);
            node_assert_1.default.equal(first.artifact.rows[0].newlyAcceptedOpen, true);
            node_assert_1.default.equal(first.artifact.rows[0].rankEligible, true);
            node_assert_1.default.match(first.artifact.predecessor.currentRefId, /^tmrefreshcurrent_[a-f0-9]{64}$/);
            node_assert_1.default.match(first.artifact.predecessor.entryId, /^tmidentityentry_[a-f0-9]{64}$/);
            node_assert_1.default.match(first.artifact.predecessor.workControlArtifactId, /^tmworkcontroldecision_[a-f0-9]{64}$/);
            node_assert_1.default.equal(first.artifact.originDigest, (0, source_contracts_js_1.taskMapContractDigest)(first.artifact.predecessor));
        }
        finally {
            await (0, promises_1.rm)(parent, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("covers every mechanically closed P10.2 lifecycle delta", () => {
        const cases = [
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
        const rows = cases.map((lifecycleCase) => (build(fixtureFor([lifecycleCase])).artifact.rows[0]));
        node_assert_1.default.equal(rows.length, cases.length);
        for (const row of rows) {
            node_assert_1.default.equal(row.changedSinceLastRefresh, row.lifecycleDelta.adjudicatedDelta !== "no_op");
            node_assert_1.default.equal(row.rankEligible, row.lifecycle === "accepted_open");
        }
    });
    (0, node_test_1.it)("distinguishes a new accepted-open work from open replay and update", () => {
        const built = build(fixtureFor([
            { label: "new", previousState: "absent", currentState: "open", adjudicatedDelta: "open" },
            { label: "update", previousState: "open", currentState: "open", adjudicatedDelta: "updated" },
            { label: "replay", previousState: "open", currentState: "open", adjudicatedDelta: "no_op" },
        ]));
        const byDelta = new Map(built.artifact.rows.map((row) => [
            row.lifecycleDelta.adjudicatedDelta,
            row,
        ]));
        node_assert_1.default.equal(byDelta.get("open")?.change, "new");
        node_assert_1.default.equal(byDelta.get("open")?.newlyAcceptedOpen, true);
        node_assert_1.default.equal(byDelta.get("updated")?.change, "updated");
        node_assert_1.default.equal(byDelta.get("updated")?.newlyAcceptedOpen, false);
        node_assert_1.default.equal(byDelta.get("no_op")?.change, "unchanged");
        node_assert_1.default.equal(byDelta.get("no_op")?.changedSinceLastRefresh, false);
    });
    (0, node_test_1.it)("rejects every non-mechanical lifecycle combination", () => {
        const invalid = [
            { label: "fake-new", previousState: "open", currentState: "open", adjudicatedDelta: "open" },
            { label: "fake-update", previousState: "open", currentState: "resolved", adjudicatedDelta: "updated" },
            { label: "fake-resolve", previousState: "resolved", currentState: "resolved", adjudicatedDelta: "resolved" },
            { label: "reopen", previousState: "resolved", currentState: "open", adjudicatedDelta: "updated" },
            { label: "fake-noop", previousState: "absent", currentState: "open", adjudicatedDelta: "no_op" },
        ];
        for (const row of invalid) {
            const fixture = fixtureFor([row]);
            node_assert_1.default.throws(() => build(fixture), /lifecycle truth table|reopen/);
        }
    });
    (0, node_test_1.it)("rejects stale P10.2 heads and mismatched P10.3a artifacts", () => {
        const fixture = fixtureFor(HAPPY_CASES);
        const secondStore = clone(fixture.store);
        const secondEntry = secondStore.entries[0];
        secondEntry.entryId = `tmidentityentry_${digest("advanced-entry")}`;
        node_assert_1.default.throws(() => (0, lifecycle_facets_js_1.unsafeBuildTaskMapLifecycleFacetsFromAuthenticatedFixturesForTest)({
            firstStore: fixture.store,
            secondStore,
            projection: fixture.projection,
            workControl: fixture.workControl,
        }), /head advanced/);
        const other = fixtureFor([{
                label: "other",
                previousState: "absent",
                currentState: "open",
                adjudicatedDelta: "open",
            }]);
        node_assert_1.default.throws(() => (0, lifecycle_facets_js_1.unsafeBuildTaskMapLifecycleFacetsFromAuthenticatedFixturesForTest)({
            firstStore: fixture.store,
            secondStore: fixture.store,
            projection: fixture.projection,
            workControl: other.workControl,
        }), /predecessor does not match/);
    });
    (0, node_test_1.it)("rejects a projection changed beneath the authenticated tuple", () => {
        const fixture = fixtureFor(HAPPY_CASES);
        const projection = clone(fixture.projection);
        projection.tasks[0].title = "Coordinated but unauthenticated title";
        node_assert_1.default.throws(() => (0, lifecycle_facets_js_1.unsafeBuildTaskMapLifecycleFacetsFromAuthenticatedFixturesForTest)({
            firstStore: fixture.store,
            secondStore: fixture.store,
            projection,
            workControl: fixture.workControl,
        }), /predecessor does not match/);
    });
    (0, node_test_1.it)("rejects coordinated P10.3a rehash when its rows drift from P10.2 references", () => {
        const fixture = fixtureFor([
            { label: "first", previousState: "absent", currentState: "open", adjudicatedDelta: "open" },
            { label: "second", previousState: "absent", currentState: "open", adjudicatedDelta: "open" },
        ]);
        const changed = clone(fixture);
        const firstWork = changed.entry.sidecar.works[0];
        const secondWork = changed.entry.sidecar.works[1];
        node_assert_1.default.equal(firstWork.projectionReferences[0].kind, "task");
        node_assert_1.default.equal(secondWork.projectionReferences[0].kind, "task");
        firstWork.projectionReferences[0] = clone(secondWork.projectionReferences[0]);
        changed.entry.sidecarDigest = (0, source_contracts_js_1.taskMapContractDigest)(changed.entry.sidecar);
        changed.entry.semanticHead = {
            generation: changed.entry.generation,
            currentRefId: changed.entry.currentRefId,
            sidecarId: changed.entry.sidecarId,
            sidecarDigest: changed.entry.sidecarDigest,
        };
        changed.entry.diff.currentSidecarDigest = changed.entry.sidecarDigest;
        changed.entry.diffDigest = (0, source_contracts_js_1.taskMapContractDigest)(changed.entry.diff);
        changed.store.entries = [changed.entry];
        changed.workControl.predecessor.sidecarDigest =
            changed.entry.sidecarDigest;
        coordinatedRehashWorkControl(changed.workControl);
        node_assert_1.default.throws(() => build(changed), /projection rows\/digests diverge/);
    });
    (0, node_test_1.it)("rejects missing and duplicate lifecycle deltas", () => {
        const missing = fixtureFor(HAPPY_CASES, (entry) => {
            entry.sidecar.lifecycleDeltas.pop();
        });
        node_assert_1.default.throws(() => build(missing), /exactly one P10.2 lifecycle delta/);
        const duplicate = fixtureFor(HAPPY_CASES, (entry) => {
            entry.sidecar.lifecycleDeltas.push(clone(entry.sidecar.lifecycleDeltas[0]));
        });
        node_assert_1.default.throws(() => build(duplicate), /duplicate lifecycle deltas/);
    });
    (0, node_test_1.it)("rejects duplicate or contradictory projection task/root binding", () => {
        const fixture = fixtureFor(HAPPY_CASES);
        const projection = clone(fixture.projection);
        const firstTaskId = projection.roots[0].taskIds[0];
        projection.roots[0].taskIds.push(firstTaskId);
        node_assert_1.default.throws(() => (0, lifecycle_facets_js_1.unsafeBuildTaskMapLifecycleFacetsFromAuthenticatedFixturesForTest)({
            firstStore: fixture.store,
            secondStore: fixture.store,
            projection,
            workControl: fixture.workControl,
        }), /predecessor does not match|repeats a projection task ID|taskIds must be unique/);
    });
    (0, node_test_1.it)("rejects candidate/token/route and privacy-field contamination", () => {
        const built = build(fixtureFor(HAPPY_CASES));
        const candidate = clone(built.artifact);
        candidate.candidateToken = digest("candidate-token");
        node_assert_1.default.throws(() => (0, lifecycle_facets_js_1.assertTaskMapLifecycleFacets)(candidate), /invalid fields|forbidden/);
        const routed = clone(built.artifact);
        routed.route = "codex";
        node_assert_1.default.throws(() => (0, lifecycle_facets_js_1.assertTaskMapLifecycleFacets)(routed), /invalid fields|forbidden/);
        const privacy = clone(built.artifact);
        privacy.privacy.candidateTokensStored = true;
        node_assert_1.default.throws(() => (0, lifecycle_facets_js_1.assertTaskMapLifecycleFacets)(coordinatedRehash(privacy)), /privacy flags/);
        const malformedMembership = clone(built.artifact);
        const rejected = malformedMembership.rows.find((row) => (row.lifecycle === "rejected"));
        node_assert_1.default.ok(rejected);
        rejected
            .projectionTaskIds = "";
        node_assert_1.default.throws(() => (0, lifecycle_facets_js_1.assertTaskMapLifecycleFacets)(coordinatedRehash(malformedMembership)), /projection task IDs must be an array/);
    });
    (0, node_test_1.it)("rejects semantic tamper even after coordinated artifact rehash", () => {
        const built = build(fixtureFor(HAPPY_CASES));
        const tampered = clone(built.artifact);
        const row = tampered.rows.find((candidate) => (candidate.lifecycleDelta.adjudicatedDelta === "open"));
        node_assert_1.default.ok(row);
        row.change = "updated";
        node_assert_1.default.throws(() => (0, lifecycle_facets_js_1.assertTaskMapLifecycleFacets)(coordinatedRehash(tampered)), /derived lifecycle facets/);
    });
    (0, node_test_1.it)("rejects one lifecycle delta or event reused across work rows", () => {
        const built = build(fixtureFor([
            { label: "first", previousState: "absent", currentState: "open", adjudicatedDelta: "open" },
            { label: "second", previousState: "absent", currentState: "open", adjudicatedDelta: "open" },
        ]));
        const duplicateDelta = clone(built.artifact);
        duplicateDelta.rows[1].lifecycleDelta = clone(duplicateDelta.rows[0].lifecycleDelta);
        node_assert_1.default.throws(() => (0, lifecycle_facets_js_1.assertTaskMapLifecycleFacets)(coordinatedRehash(duplicateDelta)), /lifecycle delta IDs are not unique/);
        const duplicateEvent = clone(built.artifact);
        duplicateEvent.rows[1].lifecycleDelta.lifecycleEventId =
            duplicateEvent.rows[0].lifecycleDelta.lifecycleEventId;
        node_assert_1.default.throws(() => (0, lifecycle_facets_js_1.assertTaskMapLifecycleFacets)(coordinatedRehash(duplicateEvent)), /lifecycle event IDs are not unique/);
    });
    (0, node_test_1.it)("enforces the global projection-task ceiling across all work rows", () => {
        const built = build(fixtureFor([
            { label: "first", previousState: "absent", currentState: "open", adjudicatedDelta: "open" },
            { label: "second", previousState: "absent", currentState: "open", adjudicatedDelta: "open" },
        ]));
        const taskId = (index) => (`tmc_${index.toString(16).padStart(16, "0")}`);
        const atLimitIds = Array.from({ length: lifecycle_facets_js_1.TASKMAP_LIFECYCLE_FACETS_LIMITS_V1.maxProjectionTasks }, (_, index) => taskId(index));
        const atLimit = clone(built.artifact);
        atLimit.rows[0].projectionTaskIds = atLimitIds.slice(0, 4_096);
        atLimit.rows[1].projectionTaskIds = atLimitIds.slice(4_096);
        node_assert_1.default.doesNotThrow(() => ((0, lifecycle_facets_js_1.assertTaskMapLifecycleFacets)(coordinatedRehash(atLimit))));
        const overLimit = clone(atLimit);
        overLimit.rows[1].projectionTaskIds.push(taskId(lifecycle_facets_js_1.TASKMAP_LIFECYCLE_FACETS_LIMITS_V1.maxProjectionTasks));
        node_assert_1.default.throws(() => (0, lifecycle_facets_js_1.assertTaskMapLifecycleFacets)(coordinatedRehash(overLimit)), /global projection-task ceiling/);
    });
    (0, node_test_1.it)("rejects proxy, accessor, own undefined, and oversized inputs", () => {
        const fixture = fixtureFor(HAPPY_CASES);
        const proxied = clone(fixture);
        proxied.projection = new Proxy(proxied.projection, {});
        node_assert_1.default.throws(() => build(proxied), /contains a proxy/);
        const accessor = {
            firstStore: clone(fixture.store),
            secondStore: clone(fixture.store),
            projection: clone(fixture.projection),
            workControl: clone(fixture.workControl),
        };
        Object.defineProperty(accessor, "unexpected", {
            enumerable: true,
            get: () => "not allowed",
        });
        node_assert_1.default.throws(() => (0, lifecycle_facets_js_1.unsafeBuildTaskMapLifecycleFacetsFromAuthenticatedFixturesForTest)(accessor), /enumerable defined JSON data properties/);
        const undefinedField = {
            firstStore: clone(fixture.store),
            secondStore: clone(fixture.store),
            projection: clone(fixture.projection),
            workControl: clone(fixture.workControl),
        };
        undefinedField.unexpected = undefined;
        node_assert_1.default.throws(() => (0, lifecycle_facets_js_1.unsafeBuildTaskMapLifecycleFacetsFromAuthenticatedFixturesForTest)(undefinedField), /enumerable defined JSON data properties/);
        const oversized = clone(fixture);
        oversized.projection.tasks[0].title = "x".repeat(4_097);
        node_assert_1.default.throws(() => build(oversized), /string ceiling/);
    });
});
