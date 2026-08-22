"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = __importDefault(require("node:assert"));
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const harness_js_1 = require("../src/engine/taskmap/harness.js");
const exact_provenance_companion_js_1 = require("../src/engine/taskmap/exact-provenance-companion.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const strategy_source_adapter_js_1 = require("../src/engine/taskmap/strategy-source-adapter.js");
const types_js_1 = require("../src/engine/taskmap/types.js");
const COMMIT = "09262e4637bd6d0e59a2fd3dba5fc7d5fc501c57";
const REMOTE = "https://github.com/Example/FounderStrategy";
const REPOSITORY_PATH = "tasks/TASKS.md";
const COMMITTED_AT = "2026-07-28T18:40:25-07:00";
const OWNER_SCOPE = (0, source_contracts_js_1.taskMapContractDigest)("owner");
const STRATEGY_POINTERS = Array.from({ length: 9 }, (_, index) => `strategy-task-${index + 1}`);
const MANUAL_POINTERS = Array.from({ length: 4 }, (_, index) => `manual-body-task-${index + 1}`);
function sha256(value) {
    return (0, node_crypto_1.createHash)("sha256").update(value).digest("hex");
}
function projectionFixture() {
    const pointers = [
        ...STRATEGY_POINTERS.map((pointerId, index) => ({
            id: pointerId,
            sourceKind: "strategy",
            sourceObjectId: pointerId,
            sourceRefHash: (0, source_contracts_js_1.taskMapContractDigest)(`strategy:${pointerId}`),
            canonicalUrl: `${REMOTE}/blob/${COMMIT}/${REPOSITORY_PATH}`,
            sourceVersion: COMMIT,
            authority: "source_system",
            syncMode: "return_only",
            capabilities: ["read_task", "deep_link"],
        })),
        ...MANUAL_POINTERS.map((pointerId) => ({
            id: pointerId,
            sourceKind: "manual",
            sourceObjectId: pointerId,
            sourceRefHash: (0, source_contracts_js_1.taskMapContractDigest)(`manual:${pointerId}`),
            sourceVersion: "manual.1",
            authority: "user",
            syncMode: "personal_fork",
            capabilities: ["read_task"],
        })),
    ];
    const events = pointers.map((pointer, index) => ({
        id: `event-${pointer.id}`,
        pointerId: pointer.id,
        recordKind: "authoritative_task",
        activity: index % 2 === 0 ? "task_created" : "task_updated",
        occurredAt: `2026-07-${20 + (index % 7)}T17:00:00.000Z`,
        observedAt: "2026-07-27T23:00:00.000Z",
        objectRefs: index < 5
            ? ["contract:return", "workstream:product"]
            : index < 9
                ? ["proof:receipt", "workstream:company"]
                : ["workstream:body"],
        title: `Accepted task ${index + 1}`,
        summary: `Bounded accepted task ${index + 1}.`,
        extractionConfidence: 1,
        sourceStatus: index % 2 === 0 ? "open" : "in_progress",
    }));
    const rootDefinitions = [
        {
            proposalId: "root-product",
            title: "Product work",
            summary: "Current source-linked product work.",
            memberObjectRefs: ["contract:return", "workstream:product"],
            eventIds: events.slice(0, 5).map((event) => event.id),
        },
        {
            proposalId: "root-company",
            title: "Company work",
            summary: "Current company commitments.",
            memberObjectRefs: ["proof:receipt", "workstream:company"],
            eventIds: events.slice(5, 9).map((event) => event.id),
        },
        {
            proposalId: "root-body",
            title: "Body reliability",
            summary: "Current manually accepted body work.",
            memberObjectRefs: ["workstream:body"],
            eventIds: events.slice(9).map((event) => event.id),
        },
    ];
    const rootForEvent = new Map(rootDefinitions.flatMap((root) => root.eventIds.map((eventId) => [eventId, root.proposalId])));
    const input = {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        generatedAt: "2026-07-27T23:00:00.000Z",
        pointers,
        events,
    };
    const brain = {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        provider: "codex",
        model: "fixture",
        promptHash: (0, source_contracts_js_1.taskMapContractDigest)("strategy-adapter-fixture"),
        inputDigest: (0, harness_js_1.taskMapSemanticInputDigest)(input),
        generatedAt: input.generatedAt,
        roots: rootDefinitions.map((root) => ({
            proposalId: root.proposalId,
            title: root.title,
            summary: root.summary,
            evidenceEventIds: root.eventIds,
            memberObjectRefs: root.memberObjectRefs,
            confidence: 1,
        })),
        tasks: events.map((event, index) => ({
            proposalId: `task-${index}`,
            rootProposalId: rootForEvent.get(event.id),
            title: event.title,
            summary: event.summary,
            evidenceEventIds: [event.id],
            authoritativeTaskEventId: event.id,
            openState: "open",
            confidence: 1,
        })),
        edges: events.map((event, index) => ({
            proposalId: `edge-${index}`,
            fromProposalId: rootForEvent.get(event.id),
            toProposalId: `task-${index}`,
            relation: "advances",
            evidenceEventIds: [event.id],
            confidence: 1,
        })),
    };
    const projection = (0, harness_js_1.buildTaskMapProjection)(input, brain, { arm: "E4" });
    node_assert_1.default.strictEqual(projection.runStatus, "accepted", JSON.stringify(projection.rejections));
    node_assert_1.default.deepStrictEqual((0, harness_js_1.taskMapProjectionArtifactValidationReasons)(projection), []);
    const currentness = {
        contractVersion: "taskmap-native-currentness-gate.v1",
        runId: projection.runId,
        inputDigest: projection.inputDigest,
        projectionDigest: (0, source_contracts_js_1.diffTaskMapProjections)(null, projection).currentProjectionDigest,
        taskDispositions: projection.tasks.map((task) => ({
            taskId: task.id,
            disposition: "current",
        })),
    };
    return { projection, currentness };
}
function fixture() {
    const { projection, currentness } = projectionFixture();
    const repositoryRows = STRATEGY_POINTERS.map((pointerId, index) => `| P${index} | Private owner label ${index} | PRIVATE_ROW_BODY_${index} |`);
    const repositoryText = [
        "# Private task board",
        "| Priority | Goal | Private detail |",
        "| --- | --- | --- |",
        ...repositoryRows,
    ].join("\n");
    const rowBindings = STRATEGY_POINTERS.map((pointerId, index) => ({
        pointerId,
        canonicalRowDigest: (0, exact_provenance_companion_js_1.taskMapCanonicalRepositoryRowDigest)({
            repositoryRelativePath: REPOSITORY_PATH,
            sourceObjectId: pointerId,
            rowText: repositoryRows[index],
        }),
    }));
    const projectionBytes = Buffer.from(`${JSON.stringify(projection, null, 2)}\n`);
    const currentnessBytes = Buffer.from(`${JSON.stringify(currentness, null, 2)}\n`);
    const input = {
        ownerScopeDigest: OWNER_SCOPE,
        binding: {
            connectionId: "strategy-owner-read",
            sourceKind: "strategy",
            tenantOrWorkspaceDigest: (0, source_contracts_js_1.taskMapContractDigest)("strategy-workspace"),
            accountOrPrincipalDigest: OWNER_SCOPE,
            grantVersion: "strategy-read-v1",
        },
        projectionBytes,
        currentnessBytes,
        expectedProjectionFileDigest: sha256(projectionBytes),
        expectedCurrentnessFileDigest: sha256(currentnessBytes),
        rowBindings,
        repositoryProvider: {
            async readImmutableRepositoryFile(request) {
                node_assert_1.default.deepStrictEqual(request, {
                    remoteLocator: REMOTE,
                    revision: COMMIT,
                    repositoryRelativePath: REPOSITORY_PATH,
                    maximumBytes: 256 * 1_024,
                });
                return {
                    remoteLocator: REMOTE,
                    revision: COMMIT,
                    repositoryRelativePath: REPOSITORY_PATH,
                    committedAt: COMMITTED_AT,
                    content: repositoryText,
                    contentDigest: sha256(repositoryText),
                };
            },
        },
    };
    return { input, projection, currentness, repositoryText };
}
function encodeFixture(original, projection, currentness) {
    const projectionBytes = Buffer.from(`${JSON.stringify(projection)}\n`);
    const currentnessBytes = Buffer.from(`${JSON.stringify(currentness)}\n`);
    return {
        ...original.input,
        projectionBytes,
        currentnessBytes,
        expectedProjectionFileDigest: sha256(projectionBytes),
        expectedCurrentnessFileDigest: sha256(currentnessBytes),
    };
}
(0, node_test_1.describe)("Task Map Strategy source adapter", () => {
    (0, node_test_1.it)("attests only the nine current Strategy tasks from thirteen current tasks", async () => {
        const built = fixture();
        const result = await (0, strategy_source_adapter_js_1.readTaskMapStrategySourceAdapter)(built.input);
        node_assert_1.default.strictEqual(result.contractVersion, strategy_source_adapter_js_1.TASKMAP_STRATEGY_SOURCE_ADAPTER_RESULT_VERSION);
        node_assert_1.default.strictEqual(result.adapterVersion, strategy_source_adapter_js_1.TASKMAP_STRATEGY_SOURCE_ADAPTER_VERSION);
        node_assert_1.default.strictEqual(result.adapterPolicyDigest, strategy_source_adapter_js_1.TASKMAP_STRATEGY_SOURCE_ADAPTER_POLICY_DIGEST);
        node_assert_1.default.deepStrictEqual([
            result.taskMapInput.pointers.length,
            result.taskMapInput.events.length,
            result.sourceBindings.length,
            result.evidenceBindings.length,
            result.sourceSnapshot.envelopes.length,
            result.exactProvenance.tasks.length,
        ], [9, 9, 9, 9, 9, 9]);
        node_assert_1.default.deepStrictEqual([
            result.exactProvenance.projection.allCurrentTaskCount,
            result.exactProvenance.projection.attestedStrategyTaskCount,
            result.exactProvenance.projection.excludedCurrentTaskCount,
            result.exactProvenance.rootLinks.length,
        ], [13, 9, 4, 2]);
        node_assert_1.default.strictEqual(result.exactProvenance.scope, "current_strategy_owned_tasks_only");
        node_assert_1.default.ok(result.taskMapInput.pointers.every((pointer) => pointer.sourceKind === "strategy"
            && pointer.authority === "source_system"
            && pointer.sourceVersion?.length === 64));
        node_assert_1.default.ok(result.taskMapInput.events.every((event) => event.recordKind === "authoritative_task"
            && event.corpusCoverage === undefined
            && event.bodyJoinEligible === undefined
            && event.objectRefs.length === 1
            && event.objectRefs[0].startsWith("external:")));
        node_assert_1.default.ok(result.sourceBindings.every((binding) => binding.semanticClass === "source_authoritative"
            && binding.observedRevision === COMMIT
            && binding.evidenceRevision === COMMIT));
        node_assert_1.default.ok(result.evidenceBindings.every((binding) => binding.disposition === "source_authoritative"
            && binding.rootLinkRefs.length === 1));
        node_assert_1.default.ok(Object.isFrozen(result));
        const serialized = JSON.stringify(result);
        node_assert_1.default.ok(!serialized.includes("PRIVATE_ROW_BODY"));
        node_assert_1.default.ok(!serialized.includes("Private owner label"));
        node_assert_1.default.ok(!serialized.includes(built.repositoryText));
        node_assert_1.default.ok(!serialized.includes("/Users/"));
        node_assert_1.default.ok(!serialized.includes("receipt_observed"));
    });
    (0, node_test_1.it)("fails closed on mutable locators and projection/currentness digest drift", async () => {
        const built = fixture();
        await node_assert_1.default.rejects(() => (0, strategy_source_adapter_js_1.readTaskMapStrategySourceAdapter)({
            ...built.input,
            expectedProjectionFileDigest: "f".repeat(64),
        }), /digest_mismatch/);
        const mutable = structuredClone(built.projection);
        for (const source of mutable.sources) {
            if (source.sourceKind !== "strategy")
                continue;
            source.sourceVersion = "HEAD";
            source.canonicalUrl =
                `${REMOTE}/blob/HEAD/${REPOSITORY_PATH}`;
        }
        const mutableDigest = (0, source_contracts_js_1.diffTaskMapProjections)(null, mutable).currentProjectionDigest;
        const mutableCurrentness = {
            ...built.currentness,
            projectionDigest: mutableDigest,
        };
        await node_assert_1.default.rejects(() => (0, strategy_source_adapter_js_1.readTaskMapStrategySourceAdapter)(encodeFixture(built, mutable, mutableCurrentness)), /mutable_revision/);
        const malformedLocator = structuredClone(built.projection);
        for (const source of malformedLocator.sources) {
            if (source.sourceKind === "strategy") {
                source.canonicalUrl =
                    `${REMOTE}/blob/${COMMIT}/tasks/%ZZ.md`;
            }
        }
        const malformedCurrentness = {
            ...built.currentness,
            projectionDigest: (0, source_contracts_js_1.diffTaskMapProjections)(null, malformedLocator).currentProjectionDigest,
        };
        await node_assert_1.default.rejects(() => (0, strategy_source_adapter_js_1.readTaskMapStrategySourceAdapter)(encodeFixture(built, malformedLocator, malformedCurrentness)), /repository_locator_mismatch/);
        const encodedSlashLocator = structuredClone(built.projection);
        for (const source of encodedSlashLocator.sources) {
            if (source.sourceKind === "strategy") {
                source.canonicalUrl =
                    `https://github.com/Example%2FFounderStrategy`
                        + `/blob/${COMMIT}/${REPOSITORY_PATH}`;
            }
        }
        const encodedSlashCurrentness = {
            ...built.currentness,
            projectionDigest: (0, source_contracts_js_1.diffTaskMapProjections)(null, encodedSlashLocator).currentProjectionDigest,
        };
        await node_assert_1.default.rejects(() => (0, strategy_source_adapter_js_1.readTaskMapStrategySourceAdapter)(encodeFixture(built, encodedSlashLocator, encodedSlashCurrentness)), /repository_locator_mismatch/);
        const mismatchedCurrentness = structuredClone(built.currentness);
        mismatchedCurrentness.projectionDigest = "e".repeat(64);
        await node_assert_1.default.rejects(() => (0, strategy_source_adapter_js_1.readTaskMapStrategySourceAdapter)(encodeFixture(built, built.projection, mismatchedCurrentness)), /invalid_currentness/);
    });
    (0, node_test_1.it)("requires an exhaustive digest-only binding and exactly one matching row", async () => {
        const built = fixture();
        await node_assert_1.default.rejects(() => (0, strategy_source_adapter_js_1.readTaskMapStrategySourceAdapter)({
            ...built.input,
            rowBindings: built.input.rowBindings.slice(0, 8),
        }), /row_binding_mismatch/);
        await node_assert_1.default.rejects(() => (0, strategy_source_adapter_js_1.readTaskMapStrategySourceAdapter)({
            ...built.input,
            rowBindings: built.input.rowBindings.map((row, index) => (index === 0
                ? { ...row, canonicalRowDigest: "f".repeat(64) }
                : row)),
        }), /row_resolution_failed/);
        const duplicated = {
            ...built.input,
            repositoryProvider: {
                async readImmutableRepositoryFile(request) {
                    const firstRow = built.repositoryText.split("\n")[3];
                    const content = `${built.repositoryText}\n${firstRow}`;
                    return {
                        remoteLocator: request.remoteLocator,
                        revision: request.revision,
                        repositoryRelativePath: request.repositoryRelativePath,
                        committedAt: COMMITTED_AT,
                        content,
                        contentDigest: sha256(content),
                    };
                },
            },
        };
        await node_assert_1.default.rejects(() => (0, strategy_source_adapter_js_1.readTaskMapStrategySourceAdapter)(duplicated), /row_resolution_failed/);
    });
    (0, node_test_1.it)("rejects repository identity, content digest, and lifecycle contradictions", async () => {
        const built = fixture();
        await node_assert_1.default.rejects(() => (0, strategy_source_adapter_js_1.readTaskMapStrategySourceAdapter)({
            ...built.input,
            repositoryProvider: {
                async readImmutableRepositoryFile(request) {
                    return {
                        remoteLocator: "https://github.com/Other/Repository",
                        revision: request.revision,
                        repositoryRelativePath: request.repositoryRelativePath,
                        committedAt: COMMITTED_AT,
                        content: built.repositoryText,
                        contentDigest: sha256(built.repositoryText),
                    };
                },
            },
        }), /repository_response_malformed/);
        await node_assert_1.default.rejects(() => (0, strategy_source_adapter_js_1.readTaskMapStrategySourceAdapter)({
            ...built.input,
            repositoryProvider: {
                async readImmutableRepositoryFile(request) {
                    return {
                        remoteLocator: request.remoteLocator,
                        revision: request.revision,
                        repositoryRelativePath: request.repositoryRelativePath,
                        committedAt: COMMITTED_AT,
                        content: built.repositoryText,
                        contentDigest: "a".repeat(64),
                    };
                },
            },
        }), /digest_mismatch/);
        const contradiction = structuredClone(built.projection);
        const strategyTask = contradiction.tasks.find((task) => task.taskHomePointerId === STRATEGY_POINTERS[0]);
        strategyTask.sourceStatus = "completed";
        const contradictionCurrentness = {
            ...built.currentness,
            projectionDigest: (0, source_contracts_js_1.diffTaskMapProjections)(null, contradiction).currentProjectionDigest,
        };
        await node_assert_1.default.rejects(() => (0, strategy_source_adapter_js_1.readTaskMapStrategySourceAdapter)(encodeFixture(built, contradiction, contradictionCurrentness)), /lifecycle_unavailable/);
    });
    (0, node_test_1.it)("reproduces the owner 9-of-13 proof only when explicit read-only inputs are supplied", {
        skip: process.env.TASKMAP_M6_STRATEGY_REPO === undefined
            || process.env.TASKMAP_M6_OWNER_TASKMAP_ROOT === undefined
            || process.env.TASKMAP_M6_STRATEGY_BINDINGS === undefined,
    }, async () => {
        const repositoryRoot = process.env.TASKMAP_M6_STRATEGY_REPO;
        const ownerRoot = process.env.TASKMAP_M6_OWNER_TASKMAP_ROOT;
        const rowBindings = JSON.parse((0, node_fs_1.readFileSync)(process.env.TASKMAP_M6_STRATEGY_BINDINGS, "utf8"));
        const projectionBytes = (0, node_fs_1.readFileSync)(node_path_1.default.join(ownerRoot, "taskmap-projection.v1.json"));
        const currentnessBytes = (0, node_fs_1.readFileSync)(node_path_1.default.join(ownerRoot, "taskmap-currentness.v1.json"));
        const projection = JSON.parse(projectionBytes.toString("utf8"));
        const source = projection.sources.find((row) => row.sourceKind === "strategy");
        const url = new URL(source.canonicalUrl);
        const segments = decodeURIComponent(url.pathname)
            .split("/")
            .filter(Boolean);
        const remoteLocator = `https://github.com/${segments[0]}/${segments[1]}`;
        const repositoryRelativePath = segments.slice(4).join("/");
        const revision = source.sourceVersion;
        const repositoryText = (0, node_child_process_1.execFileSync)("git", [
            "-C",
            repositoryRoot,
            "show",
            `${revision}:${repositoryRelativePath}`,
        ], { encoding: "utf8" });
        const committedAt = (0, node_child_process_1.execFileSync)("git", ["-C", repositoryRoot, "show", "-s", "--format=%cI", revision], { encoding: "utf8" }).trim();
        const result = await (0, strategy_source_adapter_js_1.readTaskMapStrategySourceAdapter)({
            ownerScopeDigest: OWNER_SCOPE,
            binding: {
                connectionId: "strategy-owner-read",
                sourceKind: "strategy",
                tenantOrWorkspaceDigest: (0, source_contracts_js_1.taskMapContractDigest)("strategy-owner"),
                accountOrPrincipalDigest: OWNER_SCOPE,
                grantVersion: "strategy-read-v1",
            },
            projectionBytes,
            currentnessBytes,
            expectedProjectionFileDigest: sha256(projectionBytes),
            expectedCurrentnessFileDigest: sha256(currentnessBytes),
            rowBindings,
            repositoryProvider: {
                async readImmutableRepositoryFile(request) {
                    node_assert_1.default.strictEqual(request.remoteLocator, remoteLocator);
                    return {
                        remoteLocator,
                        revision: request.revision,
                        repositoryRelativePath,
                        committedAt,
                        content: repositoryText,
                        contentDigest: sha256(repositoryText),
                    };
                },
            },
        });
        node_assert_1.default.deepStrictEqual([
            result.exactProvenance.projection.allCurrentTaskCount,
            result.exactProvenance.projection.attestedStrategyTaskCount,
        ], [13, 9]);
    });
});
