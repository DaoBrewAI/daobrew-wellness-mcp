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
const assert = __importStar(require("node:assert/strict"));
const node_child_process_1 = require("node:child_process");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const node_crypto_1 = require("node:crypto");
const promises_2 = require("node:fs/promises");
const node_os_1 = require("node:os");
const agent_handoff_preflight_js_1 = require("../src/engine/taskmap/agent-handoff-preflight.js");
const agent_handoff_preflight_cli_js_1 = require("../src/engine/taskmap/agent-handoff-preflight-cli.js");
const agent_execution_receipts_js_1 = require("../src/engine/taskmap/agent-execution-receipts.js");
const agent_handoff_manifest_js_1 = require("../src/engine/taskmap/agent-handoff-manifest.js");
const exact_provenance_companion_js_1 = require("../src/engine/taskmap/exact-provenance-companion.js");
const local_approval_package_js_1 = require("../src/engine/taskmap/local-approval-package.js");
const native_current_work_successor_js_1 = require("../src/engine/taskmap/native-current-work-successor.js");
const ready_frontier_js_1 = require("../src/engine/taskmap/ready-frontier.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const native_refresh_service_js_1 = require("../src/engine/taskmap/native-refresh-service.js");
const types_js_1 = require("../src/engine/taskmap/types.js");
const meeting_refresh_llm_replay_js_1 = require("../src/engine/taskmap/meeting-refresh-llm-replay.js");
const agent_session_candidate_adapter_js_1 = require("../src/engine/taskmap/agent-session-candidate-adapter.js");
const agent_session_producer_freshness_js_1 = require("../src/engine/taskmap/agent-session-producer-freshness.js");
const agent_session_semantic_admission_js_1 = require("../src/engine/taskmap/agent-session-semantic-admission.js");
const taskmap_agent_session_extraction_fixture_js_1 = require("./taskmap-agent-session-extraction-fixture.js");
const meeting_producer_freshness_js_1 = require("../src/engine/taskmap/meeting-producer-freshness.js");
const native_candidate_acceptance_js_1 = require("../src/engine/taskmap/native-candidate-acceptance.js");
const native_refresh_service_js_2 = require("../src/engine/taskmap/native-refresh-service.js");
const types_js_2 = require("../src/engine/taskmap/types.js");
const native_candidate_acceptance_js_2 = require("../src/engine/taskmap/native-candidate-acceptance.js");
const native_candidate_review_js_1 = require("../src/engine/taskmap/native-candidate-review.js");
const native_semantic_builder_adapter_js_1 = require("../src/engine/taskmap/native-semantic-builder-adapter.js");
const harness_js_1 = require("../src/engine/taskmap/harness.js");
const source_contracts_js_2 = require("../src/engine/taskmap/source-contracts.js");
const strategy_source_adapter_js_1 = require("../src/engine/taskmap/strategy-source-adapter.js");
const task_ranking_publication_js_1 = require("../src/engine/taskmap/task-ranking-publication.js");
const work_control_decision_js_1 = require("../src/engine/taskmap/work-control-decision.js");
const confirmed_owner_js_1 = require("./support/confirmed-owner.js");
const CONFIRMED_OWNER = (0, confirmed_owner_js_1.confirmedTestOwner)("graph-build-v1-e2e-owner");
const OWNER = CONFIRMED_OWNER.ownerScopeDigest;
const ASSESSED_AT = "2026-08-03T12:00:00.000Z";
const CONFIRMED_AT = "2026-08-03T12:00:00.500Z";
const PROMPT_TEMPLATE = "Return the strict four-class mention JSON.\n";
const MIXED_STRATEGY_COMMIT = "1111111111111111111111111111111111111111";
const MIXED_STRATEGY_PATH = "tasks/MIXED.md";
const MIXED_STRATEGY_POINTER_ID = "ptr-strategy-unrelated-current";
const MIXED_STRATEGY_ROW = "| P1 | **Review the unrelated strategy ledger** | Owner | Current |";
const BODY = [
    "Weekly launch planning.",
    "Please prepare the launch checklist by Friday.",
    "I will send the validation report tomorrow.",
    "We decided to keep the scorer unchanged.",
    "The launch room was quiet after the review.",
].join(" ");
const MENTIONS = [
    {
        text: "Please prepare the launch checklist by Friday.",
        title: "Prepare the launch checklist",
        class: "request",
        actor: "self",
        confidence: 0.93,
    },
    {
        text: "I will send the validation report tomorrow.",
        title: "Send the validation report",
        class: "commitment",
        actor: "self",
        confidence: 0.91,
    },
    {
        text: "We decided to keep the scorer unchanged.",
        title: "Keep the scorer unchanged",
        class: "decision",
        actor: "self",
        confidence: 0.89,
    },
    {
        text: "The launch room was quiet after the review.",
        title: "Launch review context",
        class: "other",
        actor: "unknown",
        confidence: 0.72,
    },
];
function withUnrelatedStrategyCurrentTask(base) {
    const input = {
        contractVersion: types_js_2.TASKMAP_CONTRACT_VERSION,
        generatedAt: ASSESSED_AT,
        pointers: [{
                id: MIXED_STRATEGY_POINTER_ID,
                sourceKind: "strategy",
                sourceObjectId: MIXED_STRATEGY_POINTER_ID,
                sourceRefHash: (0, source_contracts_js_2.taskMapContractDigest)("mixed-strategy-source-ref"),
                canonicalUrl: "https://github.com/DaoBrewAI/DaoBrewStrategy/blob/"
                    + MIXED_STRATEGY_COMMIT + "/" + MIXED_STRATEGY_PATH,
                sourceVersion: MIXED_STRATEGY_COMMIT,
                authority: "source_system",
                syncMode: "return_only",
                capabilities: ["read_task", "deep_link"],
            }],
        events: [{
                id: "event-strategy-unrelated-current",
                pointerId: MIXED_STRATEGY_POINTER_ID,
                recordKind: "authoritative_task",
                activity: "task_created",
                occurredAt: "2026-08-02T12:00:00.000Z",
                observedAt: ASSESSED_AT,
                objectRefs: ["task:strategy-unrelated-current"],
                title: "Review the unrelated strategy ledger",
                summary: "One source-owned task unrelated to the adopted agent task.",
                extractionConfidence: 1,
                sourceStatus: "open",
                priority: 1,
            }],
    };
    const brain = {
        contractVersion: types_js_2.TASKMAP_CONTRACT_VERSION,
        provider: "codex",
        model: "gpt-5.6-sol",
        promptHash: (0, source_contracts_js_2.taskMapContractDigest)("mixed-strategy-brain"),
        inputDigest: (0, harness_js_1.taskMapSemanticInputDigest)(input),
        generatedAt: ASSESSED_AT,
        roots: [{
                proposalId: "root-strategy-unrelated-current",
                title: "Unrelated strategy work",
                summary: "A separate source-owned current workstream.",
                evidenceEventIds: ["event-strategy-unrelated-current"],
                memberObjectRefs: ["task:strategy-unrelated-current"],
                confidence: 1,
            }],
        tasks: [{
                proposalId: "task-strategy-unrelated-current",
                rootProposalId: "root-strategy-unrelated-current",
                title: "Review the unrelated strategy ledger",
                summary: "One source-owned task unrelated to the adopted agent task.",
                evidenceEventIds: ["event-strategy-unrelated-current"],
                authoritativeTaskEventId: "event-strategy-unrelated-current",
                openState: "open",
                confidence: 1,
            }],
        edges: [{
                proposalId: "edge-strategy-unrelated-current",
                fromProposalId: "root-strategy-unrelated-current",
                toProposalId: "task-strategy-unrelated-current",
                relation: "advances",
                evidenceEventIds: ["event-strategy-unrelated-current"],
                confidence: 1,
            }],
    };
    const strategy = (0, harness_js_1.buildTaskMapProjection)(input, brain, {
        arm: "E4",
        now: ASSESSED_AT,
    });
    return {
        ...base,
        sources: [...base.sources, ...strategy.sources],
        roots: [...base.roots, ...strategy.roots],
        tasks: [
            ...base.tasks,
            ...strategy.tasks.map((task) => ({
                ...task,
                openState: "completed",
            })),
        ],
        edges: [...base.edges, ...strategy.edges],
    };
}
function cannedStation(calls) {
    return async () => {
        calls.factory += 1;
        return {
            provider: {
                transport: "codex-cli",
                executable: "/sanitized/codex",
                args: [],
                model: "canned-graph-build-v1",
            },
            async run(request) {
                calls.run += 1;
                return {
                    stationId: "mention-extraction-v1",
                    model: "canned-graph-build-v1",
                    promptDigest: (0, source_contracts_js_2.taskMapContractDigest)(request.promptText),
                    inputDigest: request.inputDigest,
                    outputJson: JSON.stringify({ mentions: MENTIONS }),
                    producedAt: ASSESSED_AT,
                    transport: "codex-cli",
                };
            },
        };
    };
}
async function writeTask12PrivateJson(filePath, value, canonical = false) {
    const bytes = canonical
        ? (0, source_contracts_js_1.taskMapContractCanonicalJson)(value)
        : JSON.stringify(value, null, 2) + "\n";
    await (0, promises_1.writeFile)(filePath, bytes, { mode: 0o600 });
    await (0, promises_2.chmod)(filePath, 0o600);
}
function task12FileDigest(bytes) {
    return (0, node_crypto_1.createHash)("sha256").update(bytes).digest("hex");
}
function task12SafeSlice(source, revision, identityDigest, semanticAdmission) {
    const value = {
        contractVersion: "taskmap-native-safe-source-slice.v1",
        ownerScopeDigest: OWNER,
        source,
        recordCount: 1,
        records: [{
                identityDigest,
                revision,
                occurredAtMs: Date.parse(ASSESSED_AT),
            }],
        metadata: { sourceCount: 1 },
        ...(semanticAdmission === undefined ? {} : { semanticAdmission }),
    };
    return {
        ownerScopeDigest: OWNER,
        revision,
        sliceDigest: (0, source_contracts_js_2.taskMapContractDigest)(value),
        value,
    };
}
async function carryTask12FixtureThroughAdapterPreflights(input) {
    const base = await (0, promises_1.realpath)(await (0, promises_1.mkdtemp)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-task12-raw-v2-")));
    const ownerRoot = node_path_1.default.join(base, "owners", OWNER);
    const taskMapRoot = node_path_1.default.join(ownerRoot, "taskmap");
    const executionRoot = node_path_1.default.join(ownerRoot, "taskmap-local-execution");
    await (0, promises_1.mkdir)(taskMapRoot, { recursive: true, mode: 0o700 });
    await (0, promises_2.chmod)(ownerRoot, 0o700);
    await (0, promises_2.chmod)(taskMapRoot, 0o700);
    try {
        const runtimeRoot = node_path_1.default.join(base, "runtime");
        await (0, promises_1.mkdir)(runtimeRoot, { recursive: true, mode: 0o700 });
        const agentPromptPath = node_path_1.default.resolve(__dirname, "../../prompts/agent-session-extraction-v1.md");
        await (0, promises_1.mkdir)(CONFIRMED_OWNER.taskMapRoot, {
            recursive: true,
            mode: 0o700,
        });
        const regeneratedExtraction = await (0, taskmap_agent_session_extraction_fixture_js_1.refreshAgentSessionExtractionFixture)({
            admission: input.admission,
            taskMapRoot: CONFIRMED_OWNER.taskMapRoot,
            runtimeRoot,
            promptTemplatePath: agentPromptPath,
            assessedAt: ASSESSED_AT,
        });
        assert.deepEqual(regeneratedExtraction, input.extraction);
        const projectionPath = node_path_1.default.join(taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.projection);
        const currentnessPath = node_path_1.default.join(taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.currentness);
        const currentWorkPath = node_path_1.default.join(taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.currentWork);
        const readyProofTargetsPath = node_path_1.default.join(taskMapRoot, local_approval_package_js_1.TASKMAP_READY_PROOF_TARGETS_FILENAME);
        const acceptanceStorePath = node_path_1.default.join(CONFIRMED_OWNER.taskMapRoot, "native-candidate-acceptance.v1.json");
        await (0, promises_1.rm)(acceptanceStorePath, { force: true });
        const agentSlice = task12SafeSlice("agent_session", input.admission.admissionDigest, (0, source_contracts_js_2.taskMapContractDigest)(input.admission.clusters.map((row) => row.clusterIdentityDigest)), input.admission);
        const collectors = {
            agent_session: async () => structuredClone(agentSlice),
            calendar: async () => task12SafeSlice("calendar", "task12-calendar-r1", "task12-calendar-identity"),
            body: async () => task12SafeSlice("body", "task12-body-r1", "task12-body-identity"),
        };
        const serviceOptions = {
            confirmedOwner: CONFIRMED_OWNER,
            runtimeRoot,
            projectionPath,
            currentnessPath,
            collectors,
            nowMs: () => Date.parse(ASSESSED_AT),
            agentSessionExtractionPromptTemplatePath: agentPromptPath,
        };
        const proposalResult = await new native_refresh_service_js_1.TaskMapNativeRefreshService(serviceOptions).requestRefresh("manual");
        assert.equal(proposalResult.refreshStatus, "published");
        const proposalProjection = JSON.parse(await (0, promises_1.readFile)(projectionPath, "utf8"));
        const proposalCurrentness = JSON.parse(await (0, promises_1.readFile)(currentnessPath, "utf8"));
        const proposalReadyTargets = JSON.parse(await (0, promises_1.readFile)(readyProofTargetsPath, "utf8"));
        const proposedTask = proposalProjection.tasks.find((row) => row.title === input.targets[0].title);
        assert.ok(proposedTask);
        assert.equal(proposedTask.reviewState, "proposed");
        assert.equal(proposedTask.authority, "none");
        assert.equal(proposalCurrentness.taskDispositions.find((row) => row.taskId === proposedTask.id)?.disposition, "needs_lifecycle_review");
        assert.ok(!proposalReadyTargets.proofTargets.some((row) => row.taskId === proposedTask.id));
        const writePromotionChain = async (storePath) => {
            const firstReceipt = input.promotionStore.receipts[0];
            await (0, native_candidate_acceptance_js_2.writeTaskMapNativeCandidateAcceptanceStore)({
                storePath,
                expectedOwnerScopeDigest: OWNER,
                store: {
                    ...structuredClone(input.promotionStore),
                    headReceiptDigest: firstReceipt.promotionDigest,
                    receipts: [structuredClone(firstReceipt)],
                },
            });
            await (0, native_candidate_acceptance_js_2.writeTaskMapNativeCandidateAcceptanceStore)({
                storePath,
                expectedOwnerScopeDigest: OWNER,
                store: input.promotionStore,
            });
        };
        await writePromotionChain(acceptanceStorePath);
        await writePromotionChain(node_path_1.default.join(taskMapRoot, "native-candidate-acceptance.v1.json"));
        const acceptedResult = await new native_refresh_service_js_1.TaskMapNativeRefreshService(serviceOptions).requestRefresh("manual");
        assert.equal(acceptedResult.refreshStatus, "published");
        let projection = JSON.parse(await (0, promises_1.readFile)(projectionPath, "utf8"));
        const productionCurrentness = JSON.parse(await (0, promises_1.readFile)(currentnessPath, "utf8"));
        const productionCurrentWork = JSON.parse(await (0, promises_1.readFile)(currentWorkPath, "utf8"));
        const productionReadyTargets = JSON.parse(await (0, promises_1.readFile)(readyProofTargetsPath, "utf8"));
        const task = projection.tasks.find((row) => row.id !== productionCurrentWork.nextTaskToProve.taskId
            && input.targets.some((target) => target.title === row.title));
        assert.ok(task);
        const selectedTarget = input.targets.find((target) => target.title === task.title);
        const primaryTarget = input.targets.find((target) => target.title !== task.title);
        assert.ok(selectedTarget);
        assert.ok(primaryTarget);
        assert.equal(task.taskHomePointerId, selectedTarget.receipt.promotionId);
        const root = projection.roots.find((row) => row.id === task.rootId);
        assert.ok(root);
        const source = projection.sources.find((row) => row.id === selectedTarget.receipt.promotionId);
        assert.ok(source);
        assert.deepEqual([source.sourceKind, source.authority, source.syncMode], ["manual", "user", "personal_fork"]);
        const currentTaskIds = productionCurrentness.taskDispositions
            .filter((row) => row.disposition === "current")
            .map((row) => row.taskId)
            .sort();
        const manualProvenanceRows = currentTaskIds.map((taskId) => {
            const currentTask = projection.tasks.find((row) => row.id === taskId);
            assert.ok(currentTask?.taskHomePointerId);
            const currentSource = projection.sources.find((row) => row.id === currentTask.taskHomePointerId);
            assert.ok(currentSource);
            const receipts = input.promotionStore.receipts.filter((receipt) => receipt.promotionId === currentTask.taskHomePointerId
                && receipt.promotionDigest === currentSource.sourceVersion);
            assert.equal(receipts.length, 1);
            const receipt = receipts[0];
            const envelope = (0, source_contracts_js_1.buildTaskMapSourceEnvelope)({
                ownerScopeDigest: OWNER,
                binding: {
                    connectionId: "owner-receipt",
                    sourceKind: "manual",
                    tenantOrWorkspaceDigest: (0, source_contracts_js_2.taskMapContractDigest)({
                        domain: "taskmap-owner-receipt-store.1",
                        ownerScopeDigest: OWNER,
                    }),
                    accountOrPrincipalDigest: OWNER,
                    grantVersion: "owner-confirmed-receipt-v1",
                },
                sourceKind: "manual",
                objectType: "authoritative_task",
                sourceObjectId: receipt.promotionId,
                sourceRevision: receipt.promotionDigest,
                eventTime: receipt.confirmedAt,
                contentDigest: receipt.promotionDigest,
                authority: {
                    evidence: "authoritative_task",
                    quality: "source_native",
                    lifecycle: "explicit_user_policy",
                    completion: "explicit_user_policy",
                    rank: "accepted_work",
                },
            });
            return { taskId, envelope };
        });
        const manualSourceSnapshot = (0, source_contracts_js_1.buildTaskMapSourceSnapshot)(manualProvenanceRows.map((row) => row.envelope), []);
        const manualProvenanceInput = {
            projection,
            currentness: productionCurrentness,
            currentnessFileDigest: (0, source_contracts_js_2.taskMapContractDigest)(productionCurrentness),
            expectedSourceSnapshotDigest: manualSourceSnapshot.sourceSnapshotDigest,
            expectedAdapterVersion: exact_provenance_companion_js_1.TASKMAP_MANUAL_RECEIPT_ADAPTER_VERSION,
            expectedAdapterPolicyDigest: exact_provenance_companion_js_1.TASKMAP_MANUAL_RECEIPT_ADAPTER_POLICY_DIGEST,
            sourceSnapshot: manualSourceSnapshot,
            taskBindings: manualProvenanceRows.map((row) => ({
                taskId: row.taskId,
                sourceEnvelopeId: row.envelope.envelopeId,
                repositoryRelativePath: exact_provenance_companion_js_1.TASKMAP_MANUAL_RECEIPT_LOCATOR,
                adapterVersion: exact_provenance_companion_js_1.TASKMAP_MANUAL_RECEIPT_ADAPTER_VERSION,
                adapterPolicyDigest: exact_provenance_companion_js_1.TASKMAP_MANUAL_RECEIPT_ADAPTER_POLICY_DIGEST,
            })),
        };
        assert.equal((0, exact_provenance_companion_js_1.buildTaskMapExactProvenance)(manualProvenanceInput).tasks.length, currentTaskIds.length);
        assert.throws(() => (0, exact_provenance_companion_js_1.buildTaskMapExactProvenance)({
            ...manualProvenanceInput,
            taskBindings: manualProvenanceInput.taskBindings.map((binding) => ({
                ...binding,
                repositoryRelativePath: "owner-receipts/forged.json",
            })),
        }), /fixed durable receipt invariant/);
        const predecessorProjection = projection;
        projection = withUnrelatedStrategyCurrentTask(predecessorProjection);
        const currentness = (0, native_refresh_service_js_1.currentnessForNativeProjection)(projection, productionCurrentness);
        const strategyTask = projection.tasks.find((row) => row.taskHomePointerId === MIXED_STRATEGY_POINTER_ID);
        assert.ok(strategyTask);
        assert.equal(strategyTask.reviewState, "accepted");
        assert.equal(strategyTask.authority, "source_system");
        const strategySource = projection.sources.find((row) => row.id === strategyTask.taskHomePointerId);
        assert.ok(strategySource);
        assert.deepEqual({
            sourceKind: strategySource.sourceKind,
            authority: strategySource.authority,
            syncMode: strategySource.syncMode,
            sourceVersion: strategySource.sourceVersion,
            canonicalUrl: strategySource.canonicalUrl,
            readTask: strategySource.capabilities.includes("read_task"),
        }, {
            sourceKind: "strategy",
            authority: "source_system",
            syncMode: "return_only",
            sourceVersion: MIXED_STRATEGY_COMMIT,
            canonicalUrl: "https://github.com/DaoBrewAI/DaoBrewStrategy/blob/"
                + MIXED_STRATEGY_COMMIT + "/" + MIXED_STRATEGY_PATH,
            readTask: true,
        });
        assert.equal(currentness.taskDispositions.find((row) => row.taskId === strategyTask.id)?.disposition, "current");
        const currentWork = (0, native_current_work_successor_js_1.buildTaskMapNativeCurrentWorkSuccessor)(productionCurrentWork, Buffer.from((0, source_contracts_js_1.taskMapContractCanonicalJson)(productionCurrentWork), "utf8"), predecessorProjection, productionCurrentness, projection, currentness, productionCurrentWork.nextTaskToProve.input.agentSessionEpisode ?? null, productionCurrentWork.agentSessionTaskProofs);
        const readyTargets = (0, ready_frontier_js_1.buildTaskMapReadyProofTargets)({
            projection,
            currentness,
            proofTargets: productionReadyTargets.proofTargets,
        });
        const ranking = (0, task_ranking_publication_js_1.buildTaskMapTaskRankingPublication)({
            projection,
            ownerScopeDigest: OWNER,
            sourceStatuses: [
                {
                    source: "agent_session",
                    disposition: "fresh",
                    sliceDigest: agentSlice.sliceDigest,
                },
                {
                    source: "meeting_notes",
                    disposition: "unavailable",
                    sliceDigest: null,
                },
                {
                    source: "calendar",
                    disposition: "fresh",
                    sliceDigest: (0, source_contracts_js_2.taskMapContractDigest)("mixed-calendar-status"),
                },
                {
                    source: "body",
                    disposition: "fresh",
                    sliceDigest: (0, source_contracts_js_2.taskMapContractDigest)("mixed-body-status"),
                },
            ],
        });
        const strategyEnvelope = (0, source_contracts_js_1.buildTaskMapSourceEnvelope)({
            ownerScopeDigest: OWNER,
            binding: {
                connectionId: "strategy-read",
                sourceKind: "strategy",
                tenantOrWorkspaceDigest: (0, source_contracts_js_2.taskMapContractDigest)("strategy-repository"),
                accountOrPrincipalDigest: (0, source_contracts_js_2.taskMapContractDigest)("strategy-principal"),
                grantVersion: "strategy-read-v1",
            },
            sourceKind: "strategy",
            objectType: "authoritative_task",
            sourceObjectId: MIXED_STRATEGY_POINTER_ID,
            sourceRevision: MIXED_STRATEGY_COMMIT,
            eventTime: "2026-08-02T12:00:00.000Z",
            contentDigest: (0, exact_provenance_companion_js_1.taskMapCanonicalRepositoryRowDigest)({
                repositoryRelativePath: MIXED_STRATEGY_PATH,
                sourceObjectId: MIXED_STRATEGY_POINTER_ID,
                rowText: MIXED_STRATEGY_ROW,
            }),
            authority: {
                evidence: "authoritative_task",
                quality: "source_native",
                lifecycle: "source_status",
                completion: "source_status",
                rank: "accepted_work",
            },
        });
        const strategySourceSnapshot = (0, source_contracts_js_1.buildTaskMapSourceSnapshot)([strategyEnvelope], []);
        await writeTask12PrivateJson(node_path_1.default.join(taskMapRoot, strategy_source_adapter_js_1.TASKMAP_STRATEGY_SOURCE_EVIDENCE_FILENAME), strategySourceSnapshot, true);
        assert.equal(task.reviewState, "accepted");
        assert.equal(task.authority, "user");
        assert.equal(currentness.taskDispositions.find((row) => row.taskId === task.id)?.disposition, "current");
        assert.notEqual(currentWork.nextTaskToProve.taskId, task.id);
        assert.ok(readyTargets.proofTargets.some((row) => row.taskId === task.id), "the secondary accepted agent leaf must be explicitly selectable");
        const cluster = input.admission.clusters.find((row) => row.userDirectiveSummary === task.title);
        assert.ok(cluster);
        const physiologicalContext = {
            contractVersion: "oura-taskmap-context.v1",
            generatedAt: ASSESSED_AT,
            sourceKind: "oura",
            coverage: {
                startDay: "2026-08-03",
                endDay: "2026-08-03",
                dailyActivityDays: 1,
                dailyReadinessDays: 1,
                dailySleepDays: 1,
                sleepRecords: 1,
                heartRateSamples: 1,
                classifiedDays: 1,
                unknownDays: 0,
            },
            classifier: {
                version: "relative-recovery.1",
                axis: "composite_recovery",
                method: "Personal baseline categories only.",
                minimumMetricsPerDay: 2,
                lowerThreshold: -1,
                upperThreshold: 1,
            },
            days: [{
                    dayKey: "2026-08-03",
                    axis: "composite_recovery",
                    category: "below_baseline",
                }],
            privacy: {
                rawBiometricsStored: false,
                sourceBodiesStored: false,
                localPathsStored: false,
            },
        };
        assert.ok([...projection.roots, ...projection.tasks].every((node) => node.bodyContextCount === 0));
        const body = {
            contractVersion: types_js_1.TASKMAP_BODY_CONTEXT_CONTRACT_VERSION,
            projectionRunId: projection.runId,
            projectionInputDigest: projection.inputDigest,
            generatedAt: projection.generatedAt,
            sourceKind: "oura",
            coverage: physiologicalContext.coverage,
            classifier: physiologicalContext.classifier,
            nodes: [],
            privacy: physiologicalContext.privacy,
        };
        const bodyAssessmentCore = {
            contractVersion: native_refresh_service_js_1.TASKMAP_BODY_SIGNAL_ASSESSMENT_VERSION,
            projection: {
                runId: projection.runId,
                inputDigest: projection.inputDigest,
                projectionDigest: currentness.projectionDigest,
            },
            physiologicalSnapshotDigest: (0, source_contracts_js_2.taskMapContractDigest)(physiologicalContext),
            assessedAt: ASSESSED_AT,
            sourceFamily: "physiological",
            signal: {
                axis: "composite_recovery",
                displayName: "Readiness + Sleep",
                comparison: "relative_to_recent_personal_range",
                targetCategory: "below_baseline",
            },
            coverage: {
                startDay: "2026-08-03",
                endDay: "2026-08-03",
                classifiedDays: 1,
                unknownDays: 0,
            },
            roots: projection.roots.map((candidateRoot) => ({
                rootId: candidateRoot.id,
                relationship: "not_established",
                observedSignalDates: ["2026-08-03"],
                matchedWorkDates: [],
                matchedWorkSources: [],
                matchedDateCount: 0,
                signalSummary: "Readiness + Sleep was within your recent personal range on 2026-08-03.",
                relevanceSummary: "No repeated body-informed relationship was established.",
                reasonCode: "no_exact_root_work_overlap",
            })).sort((left, right) => left.rootId.localeCompare(right.rootId)),
            boundary: "Body-informed context only. Association is not proof of cause.",
            privacy: {
                rawBiometricsStored: false,
                sourceBodiesStored: false,
                localPathsStored: false,
                providerIdentityStored: false,
            },
        };
        const bodyAssessment = {
            ...bodyAssessmentCore,
            artifactDigest: (0, source_contracts_js_2.taskMapContractDigest)(bodyAssessmentCore),
        };
        await Promise.all([
            writeTask12PrivateJson(node_path_1.default.join(taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.projection), projection),
            writeTask12PrivateJson(node_path_1.default.join(taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.currentness), currentness),
            writeTask12PrivateJson(node_path_1.default.join(taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.currentWork), currentWork, true),
            writeTask12PrivateJson(node_path_1.default.join(taskMapRoot, task_ranking_publication_js_1.TASKMAP_TASK_RANKING_FILENAME), ranking, true),
            writeTask12PrivateJson(node_path_1.default.join(taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.body), body),
            writeTask12PrivateJson(node_path_1.default.join(taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment), bodyAssessment, true),
            writeTask12PrivateJson(node_path_1.default.join(taskMapRoot, local_approval_package_js_1.TASKMAP_READY_PROOF_TARGETS_FILENAME), readyTargets, true),
        ]);
        const beforeApproval = await (0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
            taskMapRoot,
            ownerRoot,
            taskId: task.id,
        });
        assert.equal(beforeApproval.inspection.task.taskId, task.id);
        assert.notEqual(beforeApproval.inspection.localOwnerScopeDigest, OWNER, "package owner scope and candidate evidence scope must stay distinct");
        assert.equal(beforeApproval.response.status, "ready_for_approval");
        assert.equal(beforeApproval.response.approvalRecorded, false);
        assert.equal(beforeApproval.inspection.dispatchAuthorized, false);
        assert.equal(beforeApproval.inspection.codexTaskStartAuthorized, false);
        const prepared = await (0, local_approval_package_js_1.approveAndPrepareTaskMapLocalPackage)({
            taskMapRoot,
            ownerRoot,
            executionRoot,
            expectedOwnerScopeDigest: beforeApproval.inspection.localOwnerScopeDigest,
            expectedProofDigest: beforeApproval.inspection.proofDigest,
            taskId: task.id,
            idempotencyKey: beforeApproval.inspection.prepareIdempotencyKey,
            authorizedAt: "2026-08-03T12:05:00.000Z",
        });
        assert.equal(prepared.package.task.taskId, task.id);
        assert.equal(prepared.package.executionBoundary.dispatchAuthorized, false);
        assert.equal(prepared.package.executionBoundary.taskStarted, false);
        const handoff = await (0, agent_handoff_manifest_js_1.inspectTaskMapAgentHandoff)({
            taskMapRoot,
            ownerRoot,
            taskId: task.id,
        });
        assert.equal(handoff.manifest.task.taskId, task.id);
        assert.equal(handoff.manifest.preparation.packageDigest, prepared.package.packageDigest);
        let bindingBreakRejected = false;
        assert.ok(prepared.response.artifactAccess);
        const packagePath = prepared.response.artifactAccess.packagePath;
        const cliEnvironment = {
            [agent_handoff_preflight_cli_js_1.TASKMAP_AGENT_HANDOFF_PREFLIGHT_CLI_TEST_MODE_ENV]: "1",
        };
        const cliArguments = (adapter, workspace = selectedTarget.workspacePath) => [
            "inspect",
            "--adapter", adapter,
            "--package", packagePath,
            "--workspace", workspace,
            "--test-owner-root", ownerRoot,
            "--test-owner-scope-digest", OWNER,
        ];
        const codex = await (0, agent_handoff_preflight_cli_js_1.runTaskMapAgentHandoffPreflightCli)(cliArguments("codex"), { environment: cliEnvironment });
        assert.deepEqual(await (0, agent_handoff_preflight_cli_js_1.runTaskMapAgentHandoffPreflightCli)(cliArguments("codex"), { environment: cliEnvironment }), codex);
        assert.deepEqual(await (0, agent_handoff_preflight_cli_js_1.readTaskMapAgentAdapterHandoffPreflightArtifact)(packagePath, codex.adapterPreflightId), codex);
        const claude = await (0, agent_handoff_preflight_cli_js_1.runTaskMapAgentHandoffPreflightCli)(cliArguments("claude_code"), { environment: cliEnvironment });
        assert.deepEqual(await (0, agent_handoff_preflight_cli_js_1.readTaskMapAgentAdapterHandoffPreflightArtifact)(packagePath, claude.adapterPreflightId), claude);
        const selectedWorkspaceBinding = await (0, agent_handoff_preflight_cli_js_1.resolveTaskMapAgentWorkspaceBinding)({
            workspacePath: selectedTarget.workspacePath,
            expectedCandidateOwnerScopeDigest: OWNER,
            routingIdentityKind: cluster.routingKind,
        });
        const forgedStrategyEvidence = structuredClone(strategySourceSnapshot);
        forgedStrategyEvidence.envelopes[0].sourceRevision =
            "2222222222222222222222222222222222222222";
        await writeTask12PrivateJson(node_path_1.default.join(taskMapRoot, strategy_source_adapter_js_1.TASKMAP_STRATEGY_SOURCE_EVIDENCE_FILENAME), forgedStrategyEvidence, true);
        await assert.rejects((0, agent_handoff_preflight_js_1.inspectTaskMapAdoptedAgentAdapterPreflight)({
            adapter: "codex",
            taskMapRoot,
            ownerRoot,
            expectedCandidateOwnerScopeDigest: OWNER,
            taskId: task.id,
            workspaceBinding: selectedWorkspaceBinding,
        }), /Strategy source evidence is unavailable/);
        await writeTask12PrivateJson(node_path_1.default.join(taskMapRoot, strategy_source_adapter_js_1.TASKMAP_STRATEGY_SOURCE_EVIDENCE_FILENAME), strategySourceSnapshot, true);
        const wrongRoutingKind = cluster.routingKind === "project"
            ? "repository"
            : "project";
        await assert.rejects((0, agent_handoff_preflight_cli_js_1.resolveTaskMapAgentWorkspaceBinding)({
            workspacePath: selectedTarget.workspacePath,
            expectedCandidateOwnerScopeDigest: OWNER,
            routingIdentityKind: wrongRoutingKind,
        }), /Git repository root/);
        await assert.rejects((0, agent_handoff_preflight_cli_js_1.runTaskMapAgentHandoffPreflightCli)(cliArguments("codex", primaryTarget.workspacePath), { environment: cliEnvironment }), (error) => {
            bindingBreakRejected = true;
            return error instanceof Error
                && /workspace binding is unavailable/.test(error.message);
        });
        assert.equal(codex.packageDigest, prepared.package.packageDigest);
        assert.equal(claude.packageDigest, prepared.package.packageDigest);
        assert.equal(codex.runtimeRequest.packagePayloadDigest, claude.runtimeRequest.packagePayloadDigest);
        assert.equal(codex.boundary.processStartAuthorized, false);
        assert.equal(claude.boundary.processStartAuthorized, false);
        const startInput = {
            executionRoot: node_path_1.default.join(ownerRoot, "taskmap-agent-execution"),
            packagePath,
            workspacePath: selectedTarget.workspacePath,
            sessionId: "6f7bcdfa-5f09-4b4b-a117-ae4f43b2d901",
            launchedAdapter: "codex_cli",
            adapterPreflightId: codex.adapterPreflightId,
            adapterPreflightDigest: codex.adapterPreflightDigest,
            corePreflightId: codex.corePreflightId,
            corePreflightDigest: codex.corePreflightDigest,
            runtimeRequestDigest: codex.runtimeRequest.requestDigest,
            startIdempotencyKey: codex.startIdempotencyKey,
            workspaceBindingDigest: codex.workspaceBindingDigest,
            startedAt: "2026-08-03T12:06:00.000Z",
        };
        const started = await (0, agent_execution_receipts_js_1.recordTaskMapAgentExecutionStart)(startInput);
        assert.equal(started.receipt.taskId, task.id);
        assert.equal(started.receipt.proofAdapter, "codex");
        assert.equal(started.receipt.adapterPreflightId, codex.adapterPreflightId);
        assert.equal(started.receipt.runtimeRequestDigest, codex.runtimeRequest.requestDigest);
        const replayedStart = await (0, agent_execution_receipts_js_1.recordTaskMapAgentExecutionStart)(startInput);
        assert.equal(replayedStart.replayed, true);
        return {
            currentTaskId: currentWork.nextTaskToProve.taskId,
            receiptPointerId: task.taskHomePointerId,
            packageTaskId: prepared.package.task.taskId,
            codexTaskId: codex.taskId,
            claudeTaskId: claude.taskId,
            bindingBreakRejected,
        };
    }
    finally {
        await (0, promises_1.rm)(node_path_1.default.join(CONFIRMED_OWNER.taskMapRoot, "native-candidate-acceptance.v1.json"), { force: true });
        await (0, promises_1.rm)(base, { recursive: true, force: true });
    }
}
(0, node_test_1.describe)("Task Map graph-build v1 end-to-end fixture", () => {
    (0, node_test_1.it)("replays proposals, promotes explicit proof, and ranks only accepted manual work", async () => {
        // realpath: the acceptance-store guards require canonical paths, and the
        // macOS temp dir lives under the /var -> /private/var symlink.
        const root = await (0, promises_1.realpath)(await (0, promises_1.mkdtemp)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-e2e-")));
        const snapshotPath = node_path_1.default.join(root, "granola-mcp-snapshot.json");
        const taskMapRoot = node_path_1.default.join(root, "taskmap");
        const runtimeRoot = node_path_1.default.join(root, "runtime");
        const promptTemplatePath = node_path_1.default.join(root, "mention-extraction-v1.md");
        const acceptanceStorePath = node_path_1.default.join(taskMapRoot, "native-candidate-acceptance.v1.json");
        await (0, promises_1.mkdir)(taskMapRoot, { mode: 0o700 });
        await (0, promises_1.mkdir)(runtimeRoot, { mode: 0o700 });
        const snapshotBytes = JSON.stringify({
            events: [],
            meeting_notes: [{
                    id: "sanitized-graph-build-note",
                    source: "granola",
                    source_ref: "sanitized-graph-build-note",
                    title: "Weekly launch planning",
                    created_at: "2026-08-03T09:00:00.000Z",
                    occurred_at: "2026-08-03T09:00:00.000Z",
                    participants: ["Owner", "Teammate"],
                    summary: BODY,
                    body: BODY,
                    transcript: [],
                    topics: [],
                }],
        });
        await (0, promises_1.writeFile)(snapshotPath, snapshotBytes, { mode: 0o600 });
        await (0, promises_1.writeFile)(promptTemplatePath, PROMPT_TEMPLATE, { mode: 0o600 });
        try {
            const calls = { factory: 0, run: 0 };
            const report = await (0, meeting_refresh_llm_replay_js_1.refreshTaskMapGranolaMeetingExtraction)({
                snapshotPath,
                taskMapRoot,
                runtimeRoot,
                ownerScopeDigest: OWNER,
                promptTemplatePath,
                assessedAt: ASSESSED_AT,
                createStation: cannedStation(calls),
            });
            assert.deepEqual(calls, { factory: 1, run: 1 });
            assert.equal(report.notes[0]?.status, "extracted");
            assert.deepEqual(report.notes[0]?.evidence.map((row) => row.speechActClass), ["request", "commitment", "decision", "other"]);
            assert.ok(report.notes[0]?.evidence.every((row) => row.proposalDisposition === "candidate_only"
                || row.proposalDisposition === "context_only"));
            const envelopePath = (0, meeting_refresh_llm_replay_js_1.taskMapMentionExtractionEnvelopePath)(taskMapRoot, (0, source_contracts_js_2.taskMapContractDigest)(BODY));
            const envelope = JSON.parse(await (0, promises_1.readFile)(envelopePath, "utf8"));
            assert.equal(envelope.transport, "codex-cli");
            assert.equal(envelope.model, "canned-graph-build-v1");
            assert.equal(envelope.inputDigest, (0, source_contracts_js_2.taskMapContractDigest)(BODY));
            assert.equal(typeof envelope.promptDigest, "string");
            assert.equal(typeof envelope.outputJson, "string");
            const verified = await (0, meeting_refresh_llm_replay_js_1.loadVerifiedTaskMapGranolaExtractionReport)({
                snapshotPath,
                taskMapRoot,
                runtimeRoot,
                ownerScopeDigest: OWNER,
                promptTemplatePath,
            });
            const shelf = (0, meeting_refresh_llm_replay_js_1.buildTaskMapRawGranolaCandidateShelf)(verified);
            assert.equal(shelf.candidates.length, 4);
            assert.equal(shelf.candidates.filter((row) => row.promotionEligible).length, 2);
            assert.ok(shelf.candidates.every((row) => !row.acceptedWork
                && !row.rankEligible
                && !row.routeEligible
                && !row.proveEligible
                && !row.runEligible));
            const candidate = shelf.candidates.find((row) => row.speechActClass === "commitment");
            const candidateContext = (0, meeting_refresh_llm_replay_js_1.buildTaskMapUnifiedMeetingCandidateContext)({
                ownerScopeDigest: OWNER,
                assessedAt: ASSESSED_AT,
                googleCandidates: [],
                googleResultDigest: null,
                googleSnapshotDigest: null,
                googleProducedAt: null,
                rawReport: verified,
            });
            const overlay = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateReviewFromProofRows)({
                context: candidateContext,
                previous: null,
            });
            const promotion = (0, native_candidate_acceptance_js_2.promoteTaskMapVerifiedMeetingCandidate)({
                result: null,
                overlay,
                rawReport: verified,
                previousStore: null,
                expectedOwnerScopeDigest: OWNER,
                assessedAt: ASSESSED_AT,
                candidateId: candidate.candidateId,
                expectedCandidateRevisionDigest: candidate.candidateRevisionDigest,
                expectedStatementReferenceDigest: candidate.statementReferenceDigest,
                expectedEvidenceProofDigests: candidate.evidenceProofDigests,
                idempotencyKeyDigest: (0, source_contracts_js_2.taskMapContractDigest)("graph-build-v1-explicit-confirmation"),
                confirmedAt: CONFIRMED_AT,
            });
            assert.equal(promotion.receipt.authority.authority, "user");
            assert.equal(promotion.receipt.authority.sourceKind, "manual");
            assert.equal(promotion.receipt.sourceWritebackAttempted, false);
            await (0, native_candidate_acceptance_js_2.writeTaskMapNativeCandidateAcceptanceStore)({
                storePath: acceptanceStorePath,
                expectedOwnerScopeDigest: OWNER,
                store: promotion.store,
            });
            const restartedStore = await (0, native_candidate_acceptance_js_2.loadTaskMapNativeCandidateAcceptanceStore)({
                storePath: acceptanceStorePath,
                expectedOwnerScopeDigest: OWNER,
            });
            assert.ok(restartedStore);
            const replayCalls = { factory: 0, run: 0 };
            await (0, meeting_refresh_llm_replay_js_1.refreshTaskMapGranolaMeetingExtraction)({
                snapshotPath,
                taskMapRoot,
                runtimeRoot,
                ownerScopeDigest: OWNER,
                promptTemplatePath,
                assessedAt: ASSESSED_AT,
                createStation: async () => {
                    replayCalls.factory += 1;
                    throw new Error("all-hit restart replay must not select a provider");
                },
            });
            assert.deepEqual(replayCalls, { factory: 0, run: 0 });
            const restartedReport = await (0, meeting_refresh_llm_replay_js_1.loadVerifiedTaskMapGranolaExtractionReport)({
                snapshotPath,
                taskMapRoot,
                runtimeRoot,
                ownerScopeDigest: OWNER,
                promptTemplatePath,
            });
            const restartedRows = (0, meeting_refresh_llm_replay_js_1.buildTaskMapUnifiedMeetingCandidateRows)({
                ownerScopeDigest: OWNER,
                googleCandidates: [],
                rawReport: restartedReport,
                acceptanceStore: restartedStore,
            });
            assert.equal(restartedRows.length, 3);
            assert.ok(restartedRows.every((row) => row.candidateId !== candidate.candidateId));
            const semantic = (0, meeting_refresh_llm_replay_js_1.taskMapNativeSemanticInputFromGranolaReport)(restartedReport);
            const acceptedInput = (0, native_candidate_acceptance_js_2.mergeTaskMapNativeCandidateAcceptanceIntoSemanticInput)(semantic, restartedStore);
            const projection = (0, native_semantic_builder_adapter_js_1.buildTaskMapNativeSemanticProjection)(acceptedInput, {
                candidateAcceptanceStore: restartedStore,
            });
            const acceptedTask = projection.tasks.find((task) => task.authority === "user");
            assert.ok(acceptedTask);
            assert.equal(acceptedTask.citations[0]?.sourceKind, "manual");
            assert.equal(acceptedTask.title, candidate.title);
            const directScorerRows = (0, work_control_decision_js_1.rankAcceptedOpenProjectionTasks)(projection);
            const ranking = (0, task_ranking_publication_js_1.buildTaskMapTaskRankingPublication)({
                projection,
                ownerScopeDigest: OWNER,
                sourceStatuses: [
                    { source: "agent_session", disposition: "unavailable", sliceDigest: null },
                    {
                        source: "meeting_notes",
                        disposition: "fresh",
                        sliceDigest: restartedReport.reportDigest,
                    },
                    { source: "calendar", disposition: "unavailable", sliceDigest: null },
                    { source: "body", disposition: "unavailable", sliceDigest: null },
                ],
            });
            assert.deepEqual(ranking.rankedAcceptedOpen.map((row) => row.reasonCodes), directScorerRows.map((row) => row.reasonCodes));
            assert.deepEqual(ranking.rankedAcceptedOpen.map((row) => row.taskId), [acceptedTask.id]);
            assert.equal(await (0, promises_1.readFile)(snapshotPath, "utf8"), snapshotBytes);
        }
        finally {
            await (0, promises_1.rm)(root, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("carries one raw v2 fixture through adoption, package, and both adapter preflights", async (testContext) => {
        const workspaceRoot = await (0, promises_1.realpath)(await (0, promises_1.mkdtemp)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-task12-workspace-")));
        testContext.after(async () => {
            await (0, promises_1.rm)(workspaceRoot, { recursive: true, force: true });
        });
        (0, node_child_process_1.execFileSync)("git", ["init", "-q", workspaceRoot]);
        const workspacePath = node_path_1.default.join(workspaceRoot, "project-alpha");
        const secondaryWorkspacePath = node_path_1.default.join(workspaceRoot, "project-beta");
        const extractionTaskMapRoot = node_path_1.default.join(workspaceRoot, "extraction-taskmap");
        const extractionRuntimeRoot = node_path_1.default.join(workspaceRoot, "extraction-runtime");
        await Promise.all([
            (0, promises_1.mkdir)(workspacePath, { recursive: true, mode: 0o700 }),
            (0, promises_1.mkdir)(secondaryWorkspacePath, { recursive: true, mode: 0o700 }),
            (0, promises_1.mkdir)(extractionTaskMapRoot, { recursive: true, mode: 0o700 }),
            (0, promises_1.mkdir)(extractionRuntimeRoot, { recursive: true, mode: 0o700 }),
        ]);
        await (0, promises_1.writeFile)(node_path_1.default.join(workspacePath, "README.md"), "# Task12 workspace\n", { mode: 0o600 });
        await (0, promises_1.writeFile)(node_path_1.default.join(secondaryWorkspacePath, "README.md"), "# Task12 secondary workspace\n", { mode: 0o600 });
        (0, node_child_process_1.execFileSync)("git", ["-C", workspaceRoot, "add", "."]);
        (0, node_child_process_1.execFileSync)("git", [
            "-C", workspaceRoot,
            "-c", "user.name=TaskMap Test",
            "-c", "user.email=taskmap@example.invalid",
            "commit", "-q", "-m", "Task12 workspace fixture",
        ]);
        const at = (minute) => new Date(Date.UTC(2026, 7, 3, 10, minute)).toISOString();
        const jsonl = (rows) => rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
        const codex = (input) => ({
            provider: "codex",
            rawJsonl: jsonl([
                {
                    timestamp: at(0),
                    type: "session_meta",
                    payload: { id: input.session },
                },
                {
                    timestamp: at(1),
                    type: "turn_context",
                    payload: { cwd: input.route },
                },
                ...input.turns.flatMap((turn) => [
                    {
                        timestamp: at(turn.minute),
                        type: "response_item",
                        payload: {
                            id: turn.id,
                            type: "message",
                            role: "user",
                            content: [{ type: "input_text", text: turn.text }],
                        },
                    },
                    {
                        timestamp: at(turn.minute + 1),
                        type: "response_item",
                        payload: {
                            type: "message",
                            role: "assistant",
                            content: [{
                                    type: "output_text",
                                    text: "Prepared bounded implementation evidence.",
                                }],
                        },
                    },
                ]),
            ]),
        });
        const claude = (input) => ({
            provider: "claude",
            rawJsonl: jsonl([
                {
                    timestamp: at(input.minute),
                    type: "user",
                    sessionId: input.session,
                    uuid: input.id,
                    cwd: input.route,
                    message: {
                        role: "user",
                        content: [{ type: "text", text: input.text }],
                    },
                },
                {
                    timestamp: at(input.minute + 1),
                    type: "assistant",
                    sessionId: input.session,
                    cwd: input.route,
                    message: {
                        role: "assistant",
                        content: [{
                                type: "text",
                                text: "Prepared bounded implementation evidence.",
                            }],
                    },
                },
            ]),
        });
        const wrapper = [
            "# AGENTS.md instructions for /repo/alpha",
            "<INSTRUCTIONS>",
            "Keep work on the scoped branch.",
            "</INSTRUCTIONS>",
            "Implement wrapper-aware proposal review",
        ].join("\n");
        const observations = [
            codex({
                session: "fork-a",
                route: workspacePath,
                turns: [{ id: "shared-native", text: "Implement deterministic adoption", minute: 2 }],
            }),
            codex({
                session: "fork-copy",
                route: workspacePath,
                turns: [{ id: "shared-native", text: "Implement deterministic adoption", minute: 6 }],
            }),
            codex({
                session: "same-text-new-id",
                route: workspacePath,
                turns: [{ id: "different-native", text: "Implement deterministic adoption", minute: 10 }],
            }),
            claude({
                session: "claude-support",
                route: workspacePath,
                id: "claude-native",
                text: "Implement deterministic adoption",
                minute: 14,
            }),
            codex({
                session: "wrapped",
                route: secondaryWorkspacePath,
                turns: [{ id: "wrapped-native", text: wrapper, minute: 18 }],
            }),
            claude({
                session: "workspace-beta",
                route: "/repo/beta",
                id: "beta-native",
                text: "Prepare the second workspace package",
                minute: 22,
            }),
            ...["quit", "ok", "1"].map((latest, index) => codex({
                session: "suppressed-" + index,
                route: "/repo/noise",
                turns: [
                    {
                        id: "old-" + index,
                        text: "Resurrect no prior work",
                        minute: 26 + index * 4,
                    },
                    {
                        id: "latest-" + index,
                        text: latest,
                        minute: 28 + index * 4,
                    },
                ],
            })),
        ];
        const snapshot = (0, agent_session_producer_freshness_js_1.buildTaskMapAgentSessionProducerSnapshot)({
            ownerScopeDigest: OWNER,
            producedAt: "2026-08-03T11:59:00.000Z",
            observations,
        });
        const admission = (0, agent_session_semantic_admission_js_1.buildTaskMapAgentSessionSemanticAdmission)(snapshot);
        const agentPromptPath = node_path_1.default.resolve(__dirname, "../../prompts/agent-session-extraction-v1.md");
        const extraction = await (0, taskmap_agent_session_extraction_fixture_js_1.refreshAgentSessionExtractionFixture)({
            admission,
            taskMapRoot: extractionTaskMapRoot,
            runtimeRoot: extractionRuntimeRoot,
            promptTemplatePath: agentPromptPath,
            assessedAt: ASSESSED_AT,
        });
        assert.equal(snapshot.contractVersion, "taskmap-agent-session-producer-snapshot.v2");
        assert.equal(admission.contractVersion, "taskmap-agent-session-semantic-admission.v2");
        assert.equal(admission.counts.duplicateLineage, 1);
        assert.equal(admission.counts.suppressedNonWork, 3);
        assert.deepEqual(admission.clusters.map((row) => row.userDirectiveSummary).sort(), [
            "Implement deterministic adoption",
            "Implement wrapper-aware proposal review",
            "Prepare the second workspace package",
        ]);
        assert.equal(new Set(admission.clusters.map((row) => row.workstreamIdentityDigest)).size, 3);
        const shared = admission.clusters.find((row) => row.userDirectiveSummary === "Implement deterministic adoption");
        assert.ok(shared);
        assert.equal(shared.routingKind, "project");
        assert.equal(shared.supports.length, 3);
        assert.deepEqual([...new Set(shared.supports.map((row) => row.provider))].sort(), ["claude", "codex"]);
        assert.ok(admission.clusters.some((row) => row.userDirectiveSummary === "Implement wrapper-aware proposal review"));
        assert.ok(admission.clusters.every((row) => !["quit", "ok", "1", "Resurrect no prior work"].includes(row.userDirectiveSummary)));
        const proposalGraph = (0, native_refresh_service_js_2.buildAgentSessionOnlyProjection)(admission, extraction, ASSESSED_AT);
        assert.deepEqual([proposalGraph.roots.length, proposalGraph.tasks.length, proposalGraph.edges.length], [3, 3, 3]);
        assert.ok(proposalGraph.tasks.every((row) => row.reviewState === "proposed"
            && row.authority === "none"
            && row.openState === "possibly_open"));
        const review = (0, agent_session_candidate_adapter_js_1.buildTaskMapAgentSessionCandidateReview)({
            admission,
            extraction,
            previous: null,
            expectedOwnerScopeDigest: OWNER,
            assessedAt: ASSESSED_AT,
        });
        assert.equal(review.shelf.candidates.length, 3);
        assert.ok(review.shelf.candidates.every((row) => row.candidateFamily === "agent_session"
            && !row.acceptedWork
            && !row.rankEligible
            && !row.routeEligible
            && !row.proveEligible
            && !row.runEligible));
        const candidate = review.shelf.candidates.find((row) => row.title === "Implement deterministic adoption");
        const secondaryCandidate = review.shelf.candidates.find((row) => row.title === "Implement wrapper-aware proposal review");
        assert.ok(candidate);
        assert.ok(secondaryCandidate);
        const firstPromotion = (0, native_candidate_acceptance_js_1.promoteTaskMapAgentSessionCandidate)({
            admission,
            extraction,
            overlay: review.overlay,
            previousStore: null,
            expectedOwnerScopeDigest: OWNER,
            expectedAcceptanceHeadDigest: (0, native_candidate_acceptance_js_1.taskMapNativeCandidateAcceptanceHeadDigest)(null),
            assessedAt: ASSESSED_AT,
            candidateId: candidate.candidateId,
            expectedCandidateRevisionDigest: candidate.candidateRevisionDigest,
            expectedStatementReferenceDigest: candidate.statementReferenceDigest,
            expectedEvidenceProofDigests: candidate.evidenceProofDigests,
            idempotencyKeyDigest: (0, source_contracts_js_2.taskMapContractDigest)("task12-owner-adoption"),
            confirmedAt: CONFIRMED_AT,
        });
        const promotion = (0, native_candidate_acceptance_js_1.promoteTaskMapAgentSessionCandidate)({
            admission,
            extraction,
            overlay: review.overlay,
            previousStore: firstPromotion.store,
            expectedOwnerScopeDigest: OWNER,
            expectedAcceptanceHeadDigest: (0, native_candidate_acceptance_js_1.taskMapNativeCandidateAcceptanceHeadDigest)(firstPromotion.store),
            assessedAt: ASSESSED_AT,
            candidateId: secondaryCandidate.candidateId,
            expectedCandidateRevisionDigest: secondaryCandidate.candidateRevisionDigest,
            expectedStatementReferenceDigest: secondaryCandidate.statementReferenceDigest,
            expectedEvidenceProofDigests: secondaryCandidate.evidenceProofDigests,
            idempotencyKeyDigest: (0, source_contracts_js_2.taskMapContractDigest)("task12-secondary-owner-adoption"),
            confirmedAt: "2026-08-03T12:04:30.000Z",
        });
        assert.deepEqual([
            promotion.receipt.authority.sourceKind,
            promotion.receipt.authority.authority,
            promotion.receipt.authority.syncMode,
            promotion.receipt.sourceWritebackAttempted,
        ], ["manual", "user", "personal_fork", false]);
        const acceptedInput = (0, native_candidate_acceptance_js_2.mergeTaskMapNativeCandidateAcceptanceIntoSemanticInput)({
            contractVersion: "taskmap-native-semantic-builder-input.v1",
            ownerScopeDigest: OWNER,
            producer: {
                id: meeting_producer_freshness_js_1.TASKMAP_MEETING_PRODUCER_RESULT_VERSION,
                version: meeting_producer_freshness_js_1.TASKMAP_MEETING_PRODUCER_VERSION,
            },
            freshness: {
                decision: "fresh",
                available: true,
                retainedLastGood: false,
                producedAt: ASSESSED_AT,
                validThrough: "2026-08-03T16:00:00.000Z",
                assessedAt: ASSESSED_AT,
            },
            sourceBindings: [],
            evidenceBindings: [],
            taskMapInput: {
                contractVersion: types_js_2.TASKMAP_CONTRACT_VERSION,
                generatedAt: ASSESSED_AT,
                pointers: [],
                events: [],
            },
        }, promotion.store);
        const acceptedProjection = (0, native_semantic_builder_adapter_js_1.buildTaskMapNativeSemanticProjection)(acceptedInput, { candidateAcceptanceStore: promotion.store });
        const accepted = acceptedProjection.tasks.filter((row) => row.authority === "user"
            && row.reviewState === "accepted"
            && row.openState === "open");
        assert.equal(accepted.length, 2);
        const selected = accepted.find((row) => row.title === candidate.title);
        const primary = accepted.find((row) => row.title === secondaryCandidate.title);
        assert.ok(selected);
        assert.ok(primary);
        assert.equal(selected.taskHomePointerId, firstPromotion.receipt.promotionId);
        assert.deepEqual(new Set((0, work_control_decision_js_1.rankAcceptedOpenProjectionTasks)(acceptedProjection)
            .map((row) => row.taskId)), new Set([primary.id, selected.id]));
        const expandedSnapshot = (0, agent_session_producer_freshness_js_1.buildTaskMapAgentSessionProducerSnapshot)({
            ownerScopeDigest: OWNER,
            producedAt: "2026-08-03T11:59:00.000Z",
            observations: [
                ...observations,
                codex({
                    session: "late-support",
                    route: workspacePath,
                    turns: [{
                            id: "late-native",
                            text: "Implement deterministic adoption",
                            minute: 46,
                        }],
                }),
            ],
        });
        const expandedAdmission = (0, agent_session_semantic_admission_js_1.buildTaskMapAgentSessionSemanticAdmission)(expandedSnapshot);
        const expandedCluster = expandedAdmission.clusters.find((row) => row.userDirectiveSummary === candidate.title);
        assert.ok(expandedCluster);
        assert.equal(expandedCluster.supports.length, shared.supports.length + 1);
        const acceptedRanking = (0, task_ranking_publication_js_1.buildTaskMapTaskRankingPublication)({
            projection: acceptedProjection,
            ownerScopeDigest: OWNER,
            sourceStatuses: [
                { source: "agent_session", disposition: "unavailable", sliceDigest: null },
                { source: "meeting_notes", disposition: "unavailable", sliceDigest: null },
                { source: "calendar", disposition: "unavailable", sliceDigest: null },
                { source: "body", disposition: "unavailable", sliceDigest: null },
            ],
        });
        const staleReceiptProofs = (0, native_refresh_service_js_2.acceptedAgentSessionTaskProofs)(expandedAdmission, await (0, taskmap_agent_session_extraction_fixture_js_1.refreshAgentSessionExtractionFixture)({
            admission: expandedAdmission,
            taskMapRoot: extractionTaskMapRoot,
            runtimeRoot: extractionRuntimeRoot,
            promptTemplatePath: agentPromptPath,
            assessedAt: ASSESSED_AT,
        }), promotion.store, acceptedProjection, acceptedRanking);
        assert.ok(!staleReceiptProofs.some((row) => row.taskId === selected.id));
        assert.ok(staleReceiptProofs.some((row) => row.taskId === primary.id));
        const completed = await carryTask12FixtureThroughAdapterPreflights({
            acceptedProjection,
            admission,
            extraction,
            promotionStore: promotion.store,
            targets: [
                {
                    title: candidate.title,
                    receipt: firstPromotion.receipt,
                    workspacePath,
                },
                {
                    title: secondaryCandidate.title,
                    receipt: promotion.receipt,
                    workspacePath: secondaryWorkspacePath,
                },
            ],
        });
        assert.notEqual(completed.currentTaskId, completed.packageTaskId);
        const packagedTask = accepted.find((row) => row.id === completed.packageTaskId);
        assert.ok(packagedTask);
        assert.equal(completed.receiptPointerId, packagedTask.taskHomePointerId);
        assert.equal(completed.codexTaskId, completed.packageTaskId);
        assert.equal(completed.claudeTaskId, completed.packageTaskId);
        assert.equal(completed.bindingBreakRejected, true);
    });
});
