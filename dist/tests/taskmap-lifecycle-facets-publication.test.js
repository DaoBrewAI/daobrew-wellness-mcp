"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = __importDefault(require("node:assert"));
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const harness_js_1 = require("../src/engine/taskmap/harness.js");
const identity_dedupe_projection_js_1 = require("../src/engine/taskmap/identity-dedupe-projection.js");
const lifecycle_facets_publication_js_1 = require("../src/engine/taskmap/lifecycle-facets-publication.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const refresh_plan_js_1 = require("../src/engine/taskmap/refresh-plan.js");
const refresh_run_bundle_js_1 = require("../src/engine/taskmap/refresh-run-bundle.js");
const refresh_current_ref_js_1 = require("../src/engine/taskmap/refresh-current-ref.js");
const types_js_1 = require("../src/engine/taskmap/types.js");
const GENERATED_AT = "2026-07-28T12:00:00.000Z";
const FIRST_GENERATION = "00000000000000000001";
const SECOND_GENERATION = "00000000000000000002";
const digest = (label) => (0, source_contracts_js_1.taskMapContractDigest)({
    domain: "p11.1b-2a-lifecycle-publication-test",
    label,
});
const OWNER_SCOPE_DIGEST = digest("owner");
function projectionFixture() {
    const input = {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
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
    const brain = {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        provider: "synthetic-brain",
        model: "synthetic-model",
        promptHash: "aaaaaaaaaaaaaaaa",
        inputDigest: (0, harness_js_1.taskMapSemanticInputDigest)(input),
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
    return JSON.parse(JSON.stringify((0, harness_js_1.buildTaskMapProjection)(input, brain, {
        arm: "E4",
        now: GENERATED_AT,
    })));
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
        digest: digest(`policy:${name}`),
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
function realSourceFixture(projection) {
    const binding = {
        connectionId: "synthetic-p111b-publication-linear",
        sourceKind: "linear",
        tenantOrWorkspaceDigest: digest("workspace"),
        accountOrPrincipalDigest: digest("principal"),
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
        contentDigest: digest(`content:${task.id}`),
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
    const reviewAttestationDigest = digest("review-attestation");
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
            truthSetDigest: digest("truth"),
            reviewBatchDigest: digest("review-batch"),
            reviewAttestationVersion: refresh_plan_js_1.TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION,
            reviewAttestationDigest,
            sourceManifestDigest: digest("source-manifest"),
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
    node_assert_1.default.equal(batch.publication.state, "complete");
    const checkpoint = (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(null, {
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
async function createProductFixture(label) {
    const canonicalTmp = await (0, promises_1.realpath)((0, node_os_1.tmpdir)());
    const parent = await (0, promises_1.mkdtemp)(node_path_1.default.join(canonicalTmp, `taskmap-p11-publication-${label}-`));
    await (0, promises_1.chmod)(parent, 0o700);
    const roots = {
        currentRoot: node_path_1.default.join(parent, "current"),
        runRoot: node_path_1.default.join(parent, "run"),
        sidecarRoot: node_path_1.default.join(parent, "sidecar"),
        publicationRoot: node_path_1.default.join(parent, "publication"),
    };
    await Promise.all(Object.values(roots).map((root) => (0, promises_1.mkdir)(root, { mode: 0o700 })));
    await (0, refresh_current_ref_js_1.initializeTaskMapRefreshCurrentStore)(roots.currentRoot);
    await (0, identity_dedupe_projection_js_1.initializeTaskMapIdentityDedupeProjectionStore)({
        currentRoot: roots.currentRoot,
        runRoot: roots.runRoot,
        sidecarRoot: roots.sidecarRoot,
    });
    await (0, lifecycle_facets_publication_js_1.initializeTaskMapLifecycleFacetsPublicationStore)(roots.publicationRoot);
    const projection = projectionFixture();
    const source = realSourceFixture(projection);
    const prepared = prepareRealAcceptedOrigin(projection, source);
    await (0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(roots.runRoot, prepared);
    await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
        currentRoot: roots.currentRoot,
        runRoot: roots.runRoot,
        bundleId: prepared.bundleId,
        expectedGeneration: "00000000000000000000",
        options: { operationToken: "34".repeat(16) },
    });
    await (0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)({
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
async function withProductFixture(label, run) {
    const fixture = await createProductFixture(label);
    try {
        return await run(fixture);
    }
    finally {
        await (0, promises_1.rm)(fixture.parent, { recursive: true, force: true });
    }
}
async function advanceP10WithRollback(roots, tokenByte) {
    const current = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(roots.currentRoot, roots.runRoot);
    node_assert_1.default.equal(current.head?.generation, FIRST_GENERATION);
    const rolledBack = await (0, refresh_current_ref_js_1.rollbackTaskMapRefreshCurrent)({
        currentRoot: roots.currentRoot,
        runRoot: roots.runRoot,
        targetGeneration: FIRST_GENERATION,
        expectedGeneration: FIRST_GENERATION,
        expectedRefId: current.head.refId,
        options: { operationToken: tokenByte.repeat(16) },
    });
    node_assert_1.default.equal(rolledBack.ref.generation, SECOND_GENERATION);
    await (0, identity_dedupe_projection_js_1.publishTaskMapIdentityDedupeRollbackObservation)({
        currentRoot: roots.currentRoot,
        runRoot: roots.runRoot,
        sidecarRoot: roots.sidecarRoot,
        targetGeneration: SECOND_GENERATION,
    });
}
function capsulePath(roots) {
    return node_path_1.default.join(roots.publicationRoot, "generations", `${FIRST_GENERATION}.publication.json`);
}
function rehashCapsule(capsule) {
    const { publicationId: _publicationId, publicationDigest: _publicationDigest, ...core } = capsule;
    const publicationDigest = (0, source_contracts_js_1.taskMapContractDigest)(core);
    return {
        ...core,
        publicationId: `tmlifecyclepublication_${publicationDigest}`,
        publicationDigest,
    };
}
function workControlOriginDigest(predecessor) {
    return (0, source_contracts_js_1.taskMapContractDigest)({
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
function rehashLifecycleArtifact(artifact) {
    artifact.originDigest = (0, source_contracts_js_1.taskMapContractDigest)(artifact.predecessor);
    const { artifactId: _artifactId, artifactDigest: _artifactDigest, ...core } = artifact;
    artifact.artifactDigest = (0, source_contracts_js_1.taskMapContractDigest)(core);
    artifact.artifactId = `tmlifecyclefacets_${artifact.artifactDigest}`;
    return artifact;
}
async function replaceCapsule(roots, capsule) {
    const target = capsulePath(roots);
    await (0, promises_1.rm)(target);
    await (0, promises_1.writeFile)(target, (0, source_contracts_js_1.taskMapContractCanonicalJson)(capsule), {
        mode: 0o600,
        flag: "wx",
    });
}
(0, node_test_1.describe)("P11.1b-2a lifecycle-facets publication", () => {
    (0, node_test_1.it)("publishes and reads one deterministic authenticated capsule with exact retry", async () => {
        await withProductFixture("product", async ({ roots, projection }) => {
            const first = await (0, lifecycle_facets_publication_js_1.buildAndPublishTaskMapLifecycleFacets)({
                ...roots,
                projection,
            });
            node_assert_1.default.equal(first.publication.status, "published");
            node_assert_1.default.equal(first.capsule.contractVersion, lifecycle_facets_publication_js_1.TASKMAP_LIFECYCLE_FACETS_PUBLICATION_VERSION);
            node_assert_1.default.equal(first.projectionCanonicalBytes, (0, source_contracts_js_1.taskMapContractCanonicalJson)(projection));
            node_assert_1.default.equal(first.capsule.projectionMember.canonicalBytes, first.projectionCanonicalBytes);
            node_assert_1.default.equal(first.capsule.lifecycleMember.canonicalBytes, first.canonicalBytes);
            node_assert_1.default.equal(first.capsuleCanonicalBytes, (0, lifecycle_facets_publication_js_1.taskMapLifecycleFacetsPublicationCanonicalBytes)(first.capsule));
            node_assert_1.default.equal(first.capsule.p10Head.generation, FIRST_GENERATION);
            node_assert_1.default.equal(first.capsule.p10StorePredecessor, null);
            node_assert_1.default.equal(first.capsule.predecessorPublication, null);
            node_assert_1.default.deepEqual(first.capsule.privacy, {
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
            node_assert_1.default.ok(!first.canonicalBytes.includes('"candidateTokensStored":true'));
            node_assert_1.default.ok(!first.canonicalBytes.includes('"candidateTextStored":true'));
            node_assert_1.default.ok(!first.canonicalBytes.includes("returnRoute"));
            node_assert_1.default.ok(!first.capsuleCanonicalBytes.includes("sourceObjectId"));
            node_assert_1.default.ok(!first.capsuleCanonicalBytes.includes("sourceRevision"));
            node_assert_1.default.ok(!first.capsuleCanonicalBytes.includes(roots.currentRoot));
            const read = await (0, lifecycle_facets_publication_js_1.readTaskMapLifecycleFacetsPublicationStore)(roots);
            node_assert_1.default.equal(read.headStatus, "current");
            node_assert_1.default.equal(read.publications.length, 1);
            node_assert_1.default.equal((0, lifecycle_facets_publication_js_1.taskMapLifecycleFacetsPublicationCanonicalBytes)(read.publications[0]), first.capsuleCanonicalBytes);
            const retry = await (0, lifecycle_facets_publication_js_1.buildAndPublishTaskMapLifecycleFacets)({
                ...roots,
                projection: structuredClone(projection),
            });
            node_assert_1.default.equal(retry.publication.status, "already_published");
            node_assert_1.default.equal(retry.capsuleCanonicalBytes, first.capsuleCanonicalBytes);
        });
    });
    (0, node_test_1.it)("converges concurrent exact writers and rejects a different valid same-generation CAS", async () => {
        await withProductFixture("concurrent", async ({ roots, projection }) => {
            const [left, right] = await Promise.all([
                (0, lifecycle_facets_publication_js_1.buildAndPublishTaskMapLifecycleFacets)({ ...roots, projection }),
                (0, lifecycle_facets_publication_js_1.buildAndPublishTaskMapLifecycleFacets)({
                    ...roots,
                    projection: structuredClone(projection),
                }),
            ]);
            node_assert_1.default.deepEqual([left.publication.status, right.publication.status].sort(), ["already_published", "published"]);
            node_assert_1.default.equal(left.capsuleCanonicalBytes, right.capsuleCanonicalBytes);
        });
        const template = await createProductFixture("conflict-template");
        let templateCapsule;
        try {
            templateCapsule = (await (0, lifecycle_facets_publication_js_1.buildAndPublishTaskMapLifecycleFacets)({
                ...template.roots,
                projection: template.projection,
            })).capsule;
        }
        finally {
            await (0, promises_1.rm)(template.parent, { recursive: true, force: true });
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
            await node_assert_1.default.rejects((0, lifecycle_facets_publication_js_1.buildAndPublishTaskMapLifecycleFacets)({ ...roots, projection }, {
                faultInjection: async (point) => {
                    if (point !== "before_final_p10_read" || inserted)
                        return;
                    inserted = true;
                    await (0, promises_1.writeFile)(capsulePath(roots), (0, source_contracts_js_1.taskMapContractCanonicalJson)(conflict), { mode: 0o600, flag: "wx" });
                },
            }), /no-replace CAS conflict/);
            node_assert_1.default.equal(inserted, true);
        });
    });
    (0, node_test_1.it)("rejects P10 movement before CAS without committing P11", async () => {
        await withProductFixture("before-cas", async ({ roots, projection }) => {
            let advanced = false;
            await node_assert_1.default.rejects((0, lifecycle_facets_publication_js_1.buildAndPublishTaskMapLifecycleFacets)({ ...roots, projection }, {
                faultInjection: async (point) => {
                    if (point !== "before_final_p10_read" || advanced)
                        return;
                    advanced = true;
                    await advanceP10WithRollback(roots, "45");
                },
            }), /final pre-CAS P10 head/);
            node_assert_1.default.equal(advanced, true);
            const generationNames = await import("node:fs/promises").then(({ readdir }) => readdir(node_path_1.default.join(roots.publicationRoot, "generations")));
            node_assert_1.default.deepEqual(generationNames, []);
        });
    });
    (0, node_test_1.it)("returns committed_head_advanced_retry and preserves the historical capsule", async () => {
        await withProductFixture("post-commit", async ({ roots, projection }) => {
            let advanced = false;
            const result = await (0, lifecycle_facets_publication_js_1.buildAndPublishTaskMapLifecycleFacets)({ ...roots, projection }, {
                faultInjection: async (point) => {
                    if (point !== "after_generation_link" || advanced)
                        return;
                    advanced = true;
                    await advanceP10WithRollback(roots, "56");
                },
            });
            node_assert_1.default.equal(advanced, true);
            node_assert_1.default.equal(result.publication.status, "committed_head_advanced_retry");
            node_assert_1.default.equal(result.publication.committed, true);
            const read = await (0, lifecycle_facets_publication_js_1.readTaskMapLifecycleFacetsPublicationStore)(roots);
            node_assert_1.default.equal(read.headStatus, "p10_head_advanced_retry");
            node_assert_1.default.equal(read.publications.length, 1);
            node_assert_1.default.equal(read.publications[0].publicationId, result.capsule.publicationId);
        });
    });
    (0, node_test_1.it)("rejects capsule, member, predecessor, and coordinated authority substitution", async () => {
        for (const kind of [
            "capsule",
            "member",
            "predecessor",
            "work-control",
            "substitution",
        ]) {
            await withProductFixture(`tamper-${kind}`, async ({ roots, projection }) => {
                const published = await (0, lifecycle_facets_publication_js_1.buildAndPublishTaskMapLifecycleFacets)({
                    ...roots,
                    projection,
                });
                const tampered = structuredClone(published.capsule);
                if (kind === "capsule") {
                    tampered.publicationDigest = "0".repeat(64);
                }
                else if (kind === "member") {
                    const member = JSON.parse(tampered.projectionMember.canonicalBytes);
                    member.tasks[0].title = "Coordinated member tamper";
                    tampered.projectionMember.canonicalBytes =
                        (0, source_contracts_js_1.taskMapContractCanonicalJson)(member);
                    tampered.projectionMember.byteLength = Buffer.byteLength(tampered.projectionMember.canonicalBytes, "utf8");
                    tampered.projectionMember.byteSha256 = (0, node_crypto_1.createHash)("sha256")
                        .update(tampered.projectionMember.canonicalBytes)
                        .digest("hex");
                    Object.assign(tampered, rehashCapsule(tampered));
                }
                else if (kind === "predecessor") {
                    tampered.p10Head.currentRefDigest = digest("tampered-current");
                    Object.assign(tampered, rehashCapsule(tampered));
                }
                else if (kind === "work-control") {
                    const substitutedLifecycle = JSON.parse(tampered.lifecycleMember.canonicalBytes);
                    substitutedLifecycle.predecessor.workControlArtifactDigest =
                        digest("isolated-work-control-substitution");
                    substitutedLifecycle.predecessor.workControlArtifactId =
                        `tmworkcontroldecision_${substitutedLifecycle.predecessor.workControlArtifactDigest}`;
                    rehashLifecycleArtifact(substitutedLifecycle);
                    tampered.lifecycleMember.canonicalBytes =
                        (0, source_contracts_js_1.taskMapContractCanonicalJson)(substitutedLifecycle);
                    tampered.lifecycleMember.byteLength = Buffer.byteLength(tampered.lifecycleMember.canonicalBytes, "utf8");
                    tampered.lifecycleMember.byteSha256 = (0, node_crypto_1.createHash)("sha256")
                        .update(tampered.lifecycleMember.canonicalBytes)
                        .digest("hex");
                    tampered.lifecycleMember.artifactId =
                        substitutedLifecycle.artifactId;
                    tampered.lifecycleMember.artifactDigest =
                        substitutedLifecycle.artifactDigest;
                    tampered.lifecycleMember.originDigest =
                        substitutedLifecycle.originDigest;
                    tampered.p10Head = structuredClone(substitutedLifecycle.predecessor);
                    Object.assign(tampered, rehashCapsule(tampered));
                    node_assert_1.default.equal((0, lifecycle_facets_publication_js_1.taskMapLifecycleFacetsPublicationCanonicalBytes)(tampered), (0, source_contracts_js_1.taskMapContractCanonicalJson)(tampered));
                }
                else {
                    const substitutedProjection = JSON.parse(tampered.projectionMember.canonicalBytes);
                    substitutedProjection.tasks[0].title =
                        "Coordinated authority substitution";
                    const substitutedProjectionDigest = (0, source_contracts_js_1.diffTaskMapProjections)(null, substitutedProjection).currentProjectionDigest;
                    tampered.projectionMember.canonicalBytes =
                        (0, source_contracts_js_1.taskMapContractCanonicalJson)(substitutedProjection);
                    tampered.projectionMember.byteLength = Buffer.byteLength(tampered.projectionMember.canonicalBytes, "utf8");
                    tampered.projectionMember.byteSha256 = (0, node_crypto_1.createHash)("sha256")
                        .update(tampered.projectionMember.canonicalBytes)
                        .digest("hex");
                    tampered.projectionMember.projectionDigest =
                        substitutedProjectionDigest;
                    const substitutedLifecycle = JSON.parse(tampered.lifecycleMember.canonicalBytes);
                    substitutedLifecycle.predecessor.projectionDigest =
                        substitutedProjectionDigest;
                    substitutedLifecycle.predecessor.workControlArtifactDigest =
                        digest("substituted-work-control");
                    substitutedLifecycle.predecessor.workControlArtifactId =
                        `tmworkcontroldecision_${substitutedLifecycle.predecessor.workControlArtifactDigest}`;
                    substitutedLifecycle.predecessor.workControlOriginDigest =
                        workControlOriginDigest(substitutedLifecycle.predecessor);
                    rehashLifecycleArtifact(substitutedLifecycle);
                    tampered.lifecycleMember.canonicalBytes =
                        (0, source_contracts_js_1.taskMapContractCanonicalJson)(substitutedLifecycle);
                    tampered.lifecycleMember.byteLength = Buffer.byteLength(tampered.lifecycleMember.canonicalBytes, "utf8");
                    tampered.lifecycleMember.byteSha256 = (0, node_crypto_1.createHash)("sha256")
                        .update(tampered.lifecycleMember.canonicalBytes)
                        .digest("hex");
                    tampered.lifecycleMember.artifactId =
                        substitutedLifecycle.artifactId;
                    tampered.lifecycleMember.artifactDigest =
                        substitutedLifecycle.artifactDigest;
                    tampered.lifecycleMember.originDigest =
                        substitutedLifecycle.originDigest;
                    tampered.p10Head = structuredClone(substitutedLifecycle.predecessor);
                    Object.assign(tampered, rehashCapsule(tampered));
                    node_assert_1.default.equal((0, lifecycle_facets_publication_js_1.taskMapLifecycleFacetsPublicationCanonicalBytes)(tampered), (0, source_contracts_js_1.taskMapContractCanonicalJson)(tampered));
                }
                await replaceCapsule(roots, tampered);
                await node_assert_1.default.rejects((0, lifecycle_facets_publication_js_1.readTaskMapLifecycleFacetsPublicationStore)(roots), /publication|projection member|exact P10 predecessor|authenticated P10 history member|work-control artifact/);
            });
        }
    });
    (0, node_test_1.it)("fails closed on file mode, symlink, hardlink, and directory replacement", async () => {
        await withProductFixture("mode", async ({ roots, projection }) => {
            await (0, lifecycle_facets_publication_js_1.buildAndPublishTaskMapLifecycleFacets)({ ...roots, projection });
            await (0, promises_1.chmod)(capsulePath(roots), 0o644);
            await node_assert_1.default.rejects((0, lifecycle_facets_publication_js_1.readTaskMapLifecycleFacetsPublicationStore)(roots), /same-owner 0600 regular file/);
        });
        await withProductFixture("symlink", async ({ roots, projection, parent }) => {
            await (0, lifecycle_facets_publication_js_1.buildAndPublishTaskMapLifecycleFacets)({ ...roots, projection });
            const target = capsulePath(roots);
            const backup = node_path_1.default.join(parent, "capsule-backup.json");
            await (0, promises_1.rename)(target, backup);
            await (0, promises_1.symlink)(backup, target);
            await node_assert_1.default.rejects((0, lifecycle_facets_publication_js_1.readTaskMapLifecycleFacetsPublicationStore)(roots), /same-owner 0600 regular file/);
        });
        await withProductFixture("hardlink", async ({ roots, projection, parent }) => {
            await (0, lifecycle_facets_publication_js_1.buildAndPublishTaskMapLifecycleFacets)({ ...roots, projection });
            await (0, promises_1.link)(capsulePath(roots), node_path_1.default.join(parent, "extra-link.json"));
            await node_assert_1.default.rejects((0, lifecycle_facets_publication_js_1.readTaskMapLifecycleFacetsPublicationStore)(roots), /same-owner 0600 regular file|extra hardlink/);
        });
        await withProductFixture("replacement", async ({ roots, projection }) => {
            let replaced = false;
            await node_assert_1.default.rejects((0, lifecycle_facets_publication_js_1.buildAndPublishTaskMapLifecycleFacets)({ ...roots, projection }, {
                faultInjection: async (point) => {
                    if (point !== "before_final_p10_read" || replaced)
                        return;
                    replaced = true;
                    const generations = node_path_1.default.join(roots.publicationRoot, "generations");
                    await (0, promises_1.rename)(generations, `${generations}-replaced`);
                    await (0, promises_1.mkdir)(generations, { mode: 0o700 });
                },
            }), /unknown entry|was replaced|entry bound/);
            node_assert_1.default.equal(replaced, true);
        });
    });
    (0, node_test_1.it)("recovers one bounded interrupted post-link write and retries exactly", async () => {
        await withProductFixture("recovery", async ({ roots, projection }) => {
            await node_assert_1.default.rejects((0, lifecycle_facets_publication_js_1.buildAndPublishTaskMapLifecycleFacets)({ ...roots, projection }, {
                faultInjection: (point) => {
                    if (point === "after_generation_link") {
                        throw new Error("synthetic post-link interruption");
                    }
                },
            }), /synthetic post-link interruption/);
            await node_assert_1.default.rejects((0, lifecycle_facets_publication_js_1.readTaskMapLifecycleFacetsPublicationStore)(roots), /recovery is required/);
            const recovery = await (0, lifecycle_facets_publication_js_1.recoverTaskMapLifecycleFacetsPublicationStore)(roots.publicationRoot, { externalExclusivityAsserted: true });
            node_assert_1.default.equal(recovery.removedStageCount, 1);
            node_assert_1.default.equal(recovery.retainedPublicationCount, 1);
            const retry = await (0, lifecycle_facets_publication_js_1.buildAndPublishTaskMapLifecycleFacets)({
                ...roots,
                projection,
            });
            node_assert_1.default.equal(retry.publication.status, "already_published");
            node_assert_1.default.equal((await (0, promises_1.readFile)(capsulePath(roots), "utf8")), retry.capsuleCanonicalBytes);
        });
    });
});
