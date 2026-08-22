"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = __importDefault(require("node:assert"));
const node_crypto_1 = require("node:crypto");
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const exact_provenance_companion_js_1 = require("../src/engine/taskmap/exact-provenance-companion.js");
const harness_js_1 = require("../src/engine/taskmap/harness.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const types_js_1 = require("../src/engine/taskmap/types.js");
const COMMIT = "09262e4637bd6d0e59a2fd3dba5fc7d5fc501c57";
const REPOSITORY_PATH = "tasks/TASKS.md";
const OWNER_SCOPE_DIGEST = (0, source_contracts_js_1.taskMapContractDigest)("synthetic-owner");
const ADAPTER_POLICY_DIGEST = (0, source_contracts_js_1.taskMapContractDigest)({
    version: "strategy-row-adapter.1",
    binding: "explicit-pointer-to-immutable-row",
});
const STRATEGY_BINDING = {
    connectionId: "strategy-read",
    sourceKind: "strategy",
    tenantOrWorkspaceDigest: (0, source_contracts_js_1.taskMapContractDigest)("strategy-repository"),
    accountOrPrincipalDigest: (0, source_contracts_js_1.taskMapContractDigest)("strategy-principal"),
    grantVersion: "strategy-read-v1",
};
function sourceRef(pointerId) {
    return (0, source_contracts_js_1.taskMapContractDigest)(`source:${pointerId}`);
}
function fixture(contextRelation = "related_to") {
    const pointerIds = [
        "ptr-strategy-source-aware-e2e",
        "ptr-strategy-connector-session-foundation",
        "ptr-strategy-taskmap-product-prototype",
    ];
    const input = {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        generatedAt: "2026-07-29T07:15:00.000Z",
        pointers: [
            ...pointerIds.map((pointerId) => ({
                id: pointerId,
                sourceKind: "strategy",
                sourceObjectId: pointerId,
                sourceRefHash: sourceRef(pointerId),
                canonicalUrl: `https://github.com/DaoBrewAI/DaoBrewStrategy/blob/${COMMIT}/${REPOSITORY_PATH}`,
                sourceVersion: COMMIT,
                authority: "source_system",
                syncMode: "return_only",
                capabilities: ["read_task", "deep_link"],
            })),
            {
                id: "ptr-granola-context",
                sourceKind: "granola",
                sourceObjectId: "bounded-context",
                sourceRefHash: (0, source_contracts_js_1.taskMapContractDigest)("granola-context"),
                authority: "none",
                syncMode: "reference_only",
                capabilities: ["read_context"],
            },
        ],
        events: [
            ...pointerIds.map((pointerId, index) => ({
                id: `event-${index}`,
                pointerId,
                recordKind: "authoritative_task",
                activity: "task_created",
                occurredAt: `2026-07-${20 + index}T17:00:00.000Z`,
                observedAt: "2026-07-29T07:15:00.000Z",
                objectRefs: [`task:${index}`],
                title: `Source task ${index}`,
                summary: `One bounded source task ${index}.`,
                extractionConfidence: 1,
                sourceStatus: "open",
                priority: 1,
            })),
            {
                id: "event-context",
                pointerId: "ptr-granola-context",
                recordKind: "work_context",
                activity: "context_observed",
                occurredAt: "2026-07-24T17:00:00.000Z",
                observedAt: "2026-07-29T07:15:00.000Z",
                objectRefs: ["context:related"],
                title: "Bounded context",
                summary: "This context may explain a relation but cannot prove execution.",
                extractionConfidence: 1,
            },
        ],
    };
    const brain = {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        provider: "codex",
        model: "gpt-5.6-sol",
        promptHash: (0, source_contracts_js_1.taskMapContractDigest)("exact-provenance-fixture"),
        inputDigest: (0, harness_js_1.taskMapSemanticInputDigest)(input),
        generatedAt: input.generatedAt,
        roots: [{
                proposalId: "root-current",
                title: "Current source-linked work",
                summary: "Three accepted tasks share one derived workstream.",
                evidenceEventIds: ["event-0", "event-1", "event-2", "event-context"],
                memberObjectRefs: ["task:0", "task:1", "task:2"],
                confidence: 1,
            }],
        tasks: pointerIds.map((_pointerId, index) => ({
            proposalId: `task-${index}`,
            rootProposalId: "root-current",
            title: `Source task ${index}`,
            summary: `One bounded source task ${index}.`,
            evidenceEventIds: index < 2
                ? [`event-${index}`, "event-context"]
                : [`event-${index}`],
            authoritativeTaskEventId: `event-${index}`,
            openState: "open",
            confidence: 1,
        })),
        edges: [
            ...pointerIds.map((_pointerId, index) => ({
                proposalId: `edge-${index}`,
                fromProposalId: "root-current",
                toProposalId: `task-${index}`,
                relation: "advances",
                evidenceEventIds: [`event-${index}`],
                confidence: 1,
            })),
            {
                proposalId: "edge-context",
                fromProposalId: "task-0",
                toProposalId: "task-1",
                relation: contextRelation,
                evidenceEventIds: ["event-context"],
                confidence: 1,
            },
        ],
    };
    const projection = (0, harness_js_1.buildTaskMapProjection)(input, brain, { arm: "E4" });
    const taskByPointer = new Map(projection.tasks.map((task) => [task.taskHomePointerId, task]));
    const currentTaskIds = pointerIds.slice(0, 2).map((pointerId) => taskByPointer.get(pointerId).id);
    const projectionDigest = (0, source_contracts_js_1.diffTaskMapProjections)(null, projection).currentProjectionDigest;
    const currentness = {
        contractVersion: "taskmap-native-currentness-gate.v1",
        runId: projection.runId,
        inputDigest: projection.inputDigest,
        projectionDigest,
        taskDispositions: projection.tasks.map((task) => ({
            taskId: task.id,
            disposition: currentTaskIds.includes(task.id)
                ? "current"
                : "needs_lifecycle_review",
        })),
    };
    const envelopes = pointerIds.slice(0, 2).map((pointerId, index) => {
        const rowDigest = (0, exact_provenance_companion_js_1.taskMapCanonicalRepositoryRowDigest)({
            repositoryRelativePath: REPOSITORY_PATH,
            sourceObjectId: pointerId,
            rowText: `| P0 | **Source task ${index}** | Owner | Checkpoint | Done means |`,
        });
        return (0, source_contracts_js_1.buildTaskMapSourceEnvelope)({
            ownerScopeDigest: OWNER_SCOPE_DIGEST,
            binding: STRATEGY_BINDING,
            sourceKind: "strategy",
            objectType: "authoritative_task",
            sourceObjectId: pointerId,
            sourceRevision: COMMIT,
            eventTime: `2026-07-${20 + index}T17:00:00.000Z`,
            contentDigest: rowDigest,
            authority: {
                evidence: "authoritative_task",
                quality: "source_native",
                lifecycle: "source_status",
                completion: "source_status",
                rank: "accepted_work",
            },
        });
    });
    const sourceSnapshot = (0, source_contracts_js_1.buildTaskMapSourceSnapshot)(envelopes, []);
    return {
        projection,
        currentness,
        currentnessFileDigest: (0, source_contracts_js_1.taskMapContractDigest)(currentness),
        expectedSourceSnapshotDigest: sourceSnapshot.sourceSnapshotDigest,
        expectedAdapterVersion: "strategy-row-adapter.1",
        expectedAdapterPolicyDigest: ADAPTER_POLICY_DIGEST,
        sourceSnapshot,
        taskBindings: currentTaskIds.map((taskId, index) => ({
            taskId,
            sourceEnvelopeId: envelopes[index].envelopeId,
            repositoryRelativePath: REPOSITORY_PATH,
            adapterVersion: "strategy-row-adapter.1",
            adapterPolicyDigest: ADAPTER_POLICY_DIGEST,
        })),
    };
}
function assertionContext(input) {
    return {
        projection: input.projection,
        currentness: input.currentness,
        currentnessFileDigest: input.currentnessFileDigest,
        expectedSourceSnapshotDigest: input.expectedSourceSnapshotDigest,
        expectedAdapterVersion: input.expectedAdapterVersion,
        expectedAdapterPolicyDigest: input.expectedAdapterPolicyDigest,
    };
}
function withCurrentSourceCanonicalUrl(input, canonicalUrl) {
    const projection = structuredClone(input.projection);
    const taskId = input.taskBindings[0].taskId;
    const pointerId = projection.tasks.find((task) => task.id === taskId)
        .taskHomePointerId;
    const source = projection.sources.find((row) => row.id === pointerId);
    if (canonicalUrl === undefined) {
        delete source.canonicalUrl;
    }
    else {
        source.canonicalUrl = canonicalUrl;
    }
    const projectionDigest = (0, source_contracts_js_1.diffTaskMapProjections)(null, projection).currentProjectionDigest;
    const currentness = {
        ...input.currentness,
        projectionDigest,
    };
    return {
        ...input,
        projection,
        currentness,
        currentnessFileDigest: (0, source_contracts_js_1.taskMapContractDigest)(currentness),
    };
}
(0, node_test_1.describe)("Task Map exact provenance companion", () => {
    (0, node_test_1.it)("binds every current task to one immutable row and labels roots and edges as derived", () => {
        const input = fixture();
        const artifact = (0, exact_provenance_companion_js_1.buildTaskMapExactProvenance)(input);
        const replay = (0, exact_provenance_companion_js_1.buildTaskMapExactProvenance)({
            ...input,
            taskBindings: [...input.taskBindings].reverse(),
            sourceSnapshot: (0, source_contracts_js_1.buildTaskMapSourceSnapshot)([...input.sourceSnapshot.envelopes].reverse(), []),
        });
        node_assert_1.default.strictEqual(artifact.contractVersion, exact_provenance_companion_js_1.TASKMAP_EXACT_PROVENANCE_VERSION);
        node_assert_1.default.strictEqual(artifact.tasks.length, 2);
        node_assert_1.default.strictEqual(artifact.roots.length, 1);
        node_assert_1.default.strictEqual(artifact.producer.policyDigest, exact_provenance_companion_js_1.TASKMAP_EXACT_PROVENANCE_PRODUCER_POLICY_DIGEST);
        node_assert_1.default.ok(artifact.tasks.every((row) => (row.bindingAuthority === "adapter_attested"
            && row.sourceRevision === COMMIT
            && row.repositoryRelativePath === REPOSITORY_PATH)));
        node_assert_1.default.ok(artifact.roots.every((row) => (row.factKind === "derived_projection"
            && row.algorithmPolicyDigest === input.projection.algorithmPolicyDigest)));
        node_assert_1.default.strictEqual(artifact.edges.filter((edge) => edge.relation === "advances").length, 2);
        node_assert_1.default.ok(artifact.edges
            .filter((edge) => edge.relation === "advances")
            .every((edge) => edge.executionEvidence === "exact_task_source"));
        node_assert_1.default.strictEqual(artifact.edges.find((edge) => edge.relation === "related_to")
            ?.executionEvidence, "context_only");
        node_assert_1.default.deepStrictEqual(replay, artifact);
        node_assert_1.default.strictEqual((0, exact_provenance_companion_js_1.taskMapExactProvenanceDigest)(artifact), artifact.artifactDigest);
        node_assert_1.default.deepStrictEqual((0, exact_provenance_companion_js_1.assertTaskMapExactProvenance)(artifact, assertionContext(input)), artifact);
        node_assert_1.default.ok(Object.isFrozen(artifact));
        const serialized = (0, source_contracts_js_1.taskMapContractCanonicalJson)(artifact);
        node_assert_1.default.ok(!serialized.includes("Done means"));
        node_assert_1.default.ok(!serialized.includes("/Users/"));
        node_assert_1.default.ok(!serialized.includes("Bounded context"));
        node_assert_1.default.ok(!serialized.includes("sourceRowsStored\":true"));
    });
    (0, node_test_1.it)("fails closed on incomplete coverage, unsafe paths, and coordinated proof tampering", () => {
        const input = fixture();
        node_assert_1.default.throws(() => (0, exact_provenance_companion_js_1.buildTaskMapExactProvenance)({
            ...input,
            taskBindings: input.taskBindings.slice(0, 1),
        }), /every current task requires one exact source binding/);
        node_assert_1.default.throws(() => (0, exact_provenance_companion_js_1.buildTaskMapExactProvenance)({
            ...input,
            taskBindings: input.taskBindings.map((binding, index) => (index === 0
                ? { ...binding, repositoryRelativePath: "../TASKS.md" }
                : binding)),
        }), /canonical repository-relative path/);
        const artifact = structuredClone((0, exact_provenance_companion_js_1.buildTaskMapExactProvenance)(input));
        artifact.tasks[0].canonicalRowDigest = "f".repeat(64);
        artifact.artifactDigest = (0, exact_provenance_companion_js_1.taskMapExactProvenanceDigest)(artifact);
        node_assert_1.default.throws(() => (0, exact_provenance_companion_js_1.assertTaskMapExactProvenance)(artifact, assertionContext(input)), /artifact digest or derived proof is invalid/);
        const unknown = structuredClone((0, exact_provenance_companion_js_1.buildTaskMapExactProvenance)(input));
        unknown.sourceBody = "private source text";
        unknown.artifactDigest = (0, exact_provenance_companion_js_1.taskMapExactProvenanceDigest)(unknown);
        node_assert_1.default.throws(() => (0, exact_provenance_companion_js_1.assertTaskMapExactProvenance)(unknown, assertionContext(input)), /artifact fields are invalid/);
    });
    (0, node_test_1.it)("requires external snapshot and adapter expectations, exact locators, and exact operational edges", () => {
        const input = fixture();
        const originalEnvelope = input.sourceSnapshot.envelopes[0];
        const replacementEnvelope = (0, source_contracts_js_1.buildTaskMapSourceEnvelope)({
            ownerScopeDigest: originalEnvelope.ownerScopeDigest,
            binding: originalEnvelope.binding,
            sourceKind: originalEnvelope.sourceKind,
            objectType: originalEnvelope.objectType,
            sourceObjectId: originalEnvelope.sourceObjectId,
            sourceRevision: originalEnvelope.sourceRevision,
            eventTime: originalEnvelope.eventTime,
            contentDigest: (0, source_contracts_js_1.taskMapContractDigest)("coordinated replacement row"),
            authority: originalEnvelope.authority,
        });
        const replacementSnapshot = (0, source_contracts_js_1.buildTaskMapSourceSnapshot)(input.sourceSnapshot.envelopes.map((envelope) => (envelope.envelopeId === originalEnvelope.envelopeId
            ? replacementEnvelope
            : envelope)), []);
        const replacementBindings = input.taskBindings.map((binding) => (binding.sourceEnvelopeId === originalEnvelope.envelopeId
            ? {
                ...binding,
                sourceEnvelopeId: replacementEnvelope.envelopeId,
            }
            : binding));
        node_assert_1.default.throws(() => (0, exact_provenance_companion_js_1.buildTaskMapExactProvenance)({
            ...input,
            sourceSnapshot: replacementSnapshot,
            taskBindings: replacementBindings,
        }), /externally expected digest/);
        const replacementArtifact = (0, exact_provenance_companion_js_1.buildTaskMapExactProvenance)({
            ...input,
            expectedSourceSnapshotDigest: replacementSnapshot.sourceSnapshotDigest,
            sourceSnapshot: replacementSnapshot,
            taskBindings: replacementBindings,
        });
        node_assert_1.default.throws(() => (0, exact_provenance_companion_js_1.assertTaskMapExactProvenance)(replacementArtifact, assertionContext(input)), /externally expected digest/);
        const replacementAdapterVersion = "strategy-row-adapter.2";
        const replacementAdapterPolicyDigest = (0, source_contracts_js_1.taskMapContractDigest)("strategy-row-adapter.2");
        node_assert_1.default.throws(() => (0, exact_provenance_companion_js_1.buildTaskMapExactProvenance)({
            ...input,
            expectedAdapterVersion: replacementAdapterVersion,
            expectedAdapterPolicyDigest: replacementAdapterPolicyDigest,
        }), /externally expected adapter policy/);
        const replacementAdapterArtifact = (0, exact_provenance_companion_js_1.buildTaskMapExactProvenance)({
            ...input,
            expectedAdapterVersion: replacementAdapterVersion,
            expectedAdapterPolicyDigest: replacementAdapterPolicyDigest,
            taskBindings: input.taskBindings.map((binding) => ({
                ...binding,
                adapterVersion: replacementAdapterVersion,
                adapterPolicyDigest: replacementAdapterPolicyDigest,
            })),
        });
        node_assert_1.default.throws(() => (0, exact_provenance_companion_js_1.assertTaskMapExactProvenance)(replacementAdapterArtifact, assertionContext(input)), /externally expected adapter policy/);
        node_assert_1.default.throws(() => (0, exact_provenance_companion_js_1.buildTaskMapExactProvenance)(withCurrentSourceCanonicalUrl(input, undefined)), /immutable repository locator/);
        node_assert_1.default.throws(() => (0, exact_provenance_companion_js_1.buildTaskMapExactProvenance)(withCurrentSourceCanonicalUrl(input, `https://example.com/DaoBrewAI/DaoBrewStrategy/blob/${COMMIT}/${REPOSITORY_PATH}`)), /immutable repository locator/);
        node_assert_1.default.throws(() => (0, exact_provenance_companion_js_1.buildTaskMapExactProvenance)(fixture("blocks")), /operational route edge lacks exact task-source proof/);
    });
    (0, node_test_1.it)("accepts any structurally valid immutable GitHub repository locator", () => {
        const input = withCurrentSourceCanonicalUrl(fixture(), `https://github.com/ExampleOrganization/PlanningRepository/blob/${COMMIT}/${REPOSITORY_PATH}`);
        node_assert_1.default.doesNotThrow(() => (0, exact_provenance_companion_js_1.buildTaskMapExactProvenance)(input));
    });
    (0, node_test_1.it)("reproduces the immutable nine-task owner proof when explicit local read-only roots are supplied", {
        skip: process.env.TASKMAP_M4P_STRATEGY_REPO === undefined
            || process.env.TASKMAP_M4P_OWNER_TASKMAP_ROOT === undefined,
    }, () => {
        const strategyRepo = process.env.TASKMAP_M4P_STRATEGY_REPO;
        const taskMapRoot = process.env.TASKMAP_M4P_OWNER_TASKMAP_ROOT;
        const projectionBytes = (0, node_fs_1.readFileSync)(node_path_1.default.join(taskMapRoot, "taskmap-projection.v1.json"));
        const currentnessBytes = (0, node_fs_1.readFileSync)(node_path_1.default.join(taskMapRoot, "taskmap-currentness.v1.json"));
        const projection = JSON.parse(projectionBytes.toString("utf8"));
        const currentness = JSON.parse(currentnessBytes.toString("utf8"));
        const sourceText = (0, node_child_process_1.execFileSync)("git", ["-C", strategyRepo, "show", `${COMMIT}:${REPOSITORY_PATH}`], { encoding: "utf8" });
        const eventTime = (0, node_child_process_1.execFileSync)("git", ["-C", strategyRepo, "show", "-s", "--format=%cI", COMMIT], { encoding: "utf8" }).trim();
        const selectors = new Map([
            ["ptr-strategy-source-aware-e2e", "**Source-aware E2E**"],
            [
                "ptr-strategy-connector-session-foundation",
                "**Connector + session foundation**",
            ],
            [
                "ptr-strategy-taskmap-product-prototype",
                "**Task Map product prototype**",
            ],
            [
                "ptr-strategy-migration-blocker-ledger",
                "**Migration blocker ledger**",
            ],
            [
                "ptr-strategy-meeting-capture-workflow",
                "**Meeting capture workflow**",
            ],
            ["ptr-strategy-spc-application", "SPC 申请"],
            ["ptr-strategy-nyx-contact-onepager", "NYX intro"],
            ["ptr-strategy-yc-closeout", "YC 状态收尾"],
            ["ptr-strategy-market-test-ledger", "Market-test ledger"],
        ]);
        const adapterPolicyDigest = (0, source_contracts_js_1.taskMapContractDigest)({
            version: "strategy-owner-pointer-row-attestation.1",
            commit: COMMIT,
            repositoryRelativePath: REPOSITORY_PATH,
            selectors: [...selectors].sort(([left], [right]) => left.localeCompare(right)),
            mappingAuthority: "adapter_attested_not_source_native",
        });
        const ownerScopeDigest = (0, source_contracts_js_1.taskMapContractDigest)({
            domain: "taskmap-owner-local.1",
            uid: process.getuid?.() ?? 0,
        });
        const binding = {
            connectionId: "strategy-owner-read",
            sourceKind: "strategy",
            tenantOrWorkspaceDigest: (0, source_contracts_js_1.taskMapContractDigest)("DaoBrewStrategy"),
            accountOrPrincipalDigest: ownerScopeDigest,
            grantVersion: "strategy-immutable-git-read-v1",
        };
        const currentTaskIds = new Set(currentness.taskDispositions
            .filter((row) => row.disposition === "current")
            .map((row) => row.taskId));
        const tasks = projection.tasks
            .filter((task) => currentTaskIds.has(task.id))
            .sort((left, right) => left.id.localeCompare(right.id));
        node_assert_1.default.strictEqual(tasks.length, 9);
        const lines = sourceText.replace(/\r\n?/g, "\n").split("\n");
        const envelopeByTask = tasks.map((task) => {
            const pointerId = task.taskHomePointerId;
            node_assert_1.default.ok(pointerId);
            const selector = selectors.get(pointerId);
            node_assert_1.default.ok(selector);
            const rows = lines.filter((line) => line.startsWith("|") && line.includes(selector));
            node_assert_1.default.strictEqual(rows.length, 1);
            const canonicalRowDigest = (0, exact_provenance_companion_js_1.taskMapCanonicalRepositoryRowDigest)({
                repositoryRelativePath: REPOSITORY_PATH,
                sourceObjectId: pointerId,
                rowText: rows[0],
            });
            const envelope = (0, source_contracts_js_1.buildTaskMapSourceEnvelope)({
                ownerScopeDigest,
                binding,
                sourceKind: "strategy",
                objectType: "authoritative_task",
                sourceObjectId: pointerId,
                sourceRevision: COMMIT,
                eventTime,
                contentDigest: canonicalRowDigest,
                authority: {
                    evidence: "authoritative_task",
                    quality: "source_native",
                    lifecycle: "source_status",
                    completion: "source_status",
                    rank: "accepted_work",
                },
            });
            return { taskId: task.id, envelope };
        });
        const sourceSnapshot = (0, source_contracts_js_1.buildTaskMapSourceSnapshot)(envelopeByTask.map((row) => row.envelope), []);
        const currentnessFileDigest = (0, node_crypto_1.createHash)("sha256")
            .update(currentnessBytes)
            .digest("hex");
        const adapterVersion = "strategy-owner-pointer-row-attestation.1";
        const taskBindings = envelopeByTask.map((row) => ({
            taskId: row.taskId,
            sourceEnvelopeId: row.envelope.envelopeId,
            repositoryRelativePath: REPOSITORY_PATH,
            adapterVersion,
            adapterPolicyDigest,
        }));
        const exactInput = {
            projection,
            currentness,
            currentnessFileDigest,
            expectedSourceSnapshotDigest: sourceSnapshot.sourceSnapshotDigest,
            expectedAdapterVersion: adapterVersion,
            expectedAdapterPolicyDigest: adapterPolicyDigest,
            sourceSnapshot,
            taskBindings,
        };
        const cycledBindings = taskBindings.map((binding, index) => ({
            ...binding,
            sourceEnvelopeId: taskBindings[(index + 1) % taskBindings.length].sourceEnvelopeId,
        }));
        node_assert_1.default.throws(() => (0, exact_provenance_companion_js_1.buildTaskMapExactProvenance)({
            ...exactInput,
            taskBindings: cycledBindings,
        }), /does not match the task home pointer/);
        const artifact = (0, exact_provenance_companion_js_1.buildTaskMapExactProvenance)(exactInput);
        (0, exact_provenance_companion_js_1.assertTaskMapExactProvenance)(artifact, assertionContext(exactInput));
        node_assert_1.default.strictEqual(artifact.artifactDigest, "0f904f97cf015e1c076d4c805920270b3dfbac3335816e80a3ba2fe423725884");
        node_assert_1.default.deepStrictEqual([artifact.tasks.length, artifact.roots.length, artifact.edges.length], [9, 2, 9]);
        node_assert_1.default.ok(artifact.edges.every((edge) => edge.executionEvidence === "exact_task_source"));
        const serialized = (0, source_contracts_js_1.taskMapContractCanonicalJson)(artifact);
        node_assert_1.default.ok(!serialized.includes(strategyRepo));
        node_assert_1.default.ok(!serialized.includes("/Users/"));
        node_assert_1.default.ok(!serialized.includes("Source-aware E2E"));
    });
});
