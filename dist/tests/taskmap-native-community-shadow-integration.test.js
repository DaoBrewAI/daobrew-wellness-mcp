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
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const agent_session_semantic_admission_js_1 = require("../src/engine/taskmap/agent-session-semantic-admission.js");
const agent_session_producer_freshness_js_1 = require("../src/engine/taskmap/agent-session-producer-freshness.js");
const meeting_producer_freshness_js_1 = require("../src/engine/taskmap/meeting-producer-freshness.js");
const native_candidate_review_js_1 = require("../src/engine/taskmap/native-candidate-review.js");
const native_candidate_acceptance_js_1 = require("../src/engine/taskmap/native-candidate-acceptance.js");
const native_refresh_service_js_1 = require("../src/engine/taskmap/native-refresh-service.js");
const owner_refresh_coordinator_js_1 = require("../src/engine/taskmap/owner-refresh-coordinator.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const confirmed_owner_js_1 = require("./support/confirmed-owner.js");
const REQUESTED_AT = "2026-08-17T12:00:00.000Z";
const REQUESTED_AT_MS = Date.parse(REQUESTED_AT);
const temporaryRoots = [];
function locations(prefix) {
    const root = (0, node_fs_1.realpathSync)((0, node_fs_1.mkdtempSync)(node_path_1.default.join((0, node_os_1.tmpdir)(), prefix)));
    temporaryRoots.push(root);
    const taskMapRoot = node_path_1.default.join(root, "taskmap");
    return {
        root,
        runtimeRoot: node_path_1.default.join(root, "runtime"),
        projectionPath: node_path_1.default.join(taskMapRoot, "taskmap-projection.v1.json"),
        currentnessPath: node_path_1.default.join(taskMapRoot, "taskmap-currentness.v1.json"),
    };
}
function ownerSlice(owner, source, semanticAdmission) {
    const revision = (0, source_contracts_js_1.taskMapContractDigest)(`plan2-slice:${source}`);
    const value = {
        contractVersion: "taskmap-native-safe-source-slice.v1",
        ownerScopeDigest: owner.ownerScopeDigest,
        source,
        recordCount: 1,
        records: [{
                identityDigest: (0, source_contracts_js_1.taskMapContractDigest)(`plan2-identity:${source}`),
                revision,
                occurredAtMs: REQUESTED_AT_MS - 60_000,
            }],
        ...(semanticAdmission === undefined ? {} : { semanticAdmission }),
        metadata: { sourceCount: 1 },
    };
    return {
        ownerScopeDigest: owner.ownerScopeDigest,
        revision,
        sliceDigest: (0, source_contracts_js_1.taskMapContractDigest)(value),
        value,
    };
}
function codexObservation(label, repositoryLabel = label, assistantOutcome = `Prepared authoritative Plan2 ${label}`) {
    return {
        provider: "codex",
        rawJsonl: [
            {
                timestamp: "2026-08-17T09:59:00.000Z",
                type: "session_meta",
                payload: { id: `session-${label}` },
            },
            {
                timestamp: "2026-08-17T09:59:30.000Z",
                type: "turn_context",
                payload: { repository: `/repo/${repositoryLabel}` },
            },
            {
                timestamp: "2026-08-17T10:00:00.000Z",
                type: "response_item",
                payload: {
                    id: `turn-${label}`,
                    type: "message",
                    role: "user",
                    content: [{
                            type: "input_text",
                            text: `Implement authoritative Plan2 ${label}`,
                        }],
                },
            },
            {
                timestamp: "2026-08-17T10:00:01.000Z",
                type: "response_item",
                payload: {
                    type: "message",
                    role: "assistant",
                    content: [{
                            type: "output_text",
                            text: assistantOutcome,
                        }],
                },
            },
        ].map((row) => JSON.stringify(row)).join("\n") + "\n",
    };
}
function admission(owner, observations) {
    return (0, agent_session_semantic_admission_js_1.buildTaskMapAgentSessionSemanticAdmission)((0, agent_session_producer_freshness_js_1.buildTaskMapAgentSessionProducerSnapshot)({
        ownerScopeDigest: owner.ownerScopeDigest,
        producedAt: REQUESTED_AT,
        observations,
    }));
}
function graphFeed(owner, observations) {
    return (0, agent_session_semantic_admission_js_1.buildTaskMapAgentSessionGraphFeed)({
        ownerScopeDigest: owner.ownerScopeDigest,
        producedAt: REQUESTED_AT,
        observations,
    });
}
function writeMeetingSnapshot(filePath, owner, title, revision) {
    const revisionNumber = Number(/(\d+)$/.exec(revision)?.[1] ?? "1");
    const producedAt = new Date(Date.parse("2026-08-17T11:59:00.000Z")
        + (revisionNumber - 1) * 60_000).toISOString();
    const meeting = (suffix, eventTime) => ({
        binding: {
            connectionId: "fixture-meeting",
            sourceKind: "gemini_meet",
            tenantOrWorkspaceDigest: (0, source_contracts_js_1.taskMapContractDigest)("fixture-workspace"),
            accountOrPrincipalDigest: (0, source_contracts_js_1.taskMapContractDigest)("fixture-principal"),
            grantVersion: "fixture-grant-v1",
        },
        documentId: `fixture-meeting-document-${revision}-${suffix}`,
        revisionId: `${revision}-${suffix}`,
        contentDigest: (0, source_contracts_js_1.taskMapContractDigest)(`fixture-meeting:${revision}:${suffix}`),
        modifiedAt: producedAt,
        eventTime,
        observedAt: producedAt,
        evidence: [{
                kind: "action_item",
                title,
                summary: `Meeting work for ${revision}`,
                occurredAt: eventTime,
                observedAt: producedAt,
                status: "open",
                quality: "structured_generated",
                coverage: "complete",
                confidence: 0.95,
                speechActClass: "request",
                speechActActor: "self",
                mentionIdentityDigest: (0, source_contracts_js_1.taskMapContractDigest)(`fixture-meeting-mention:${revision}:${suffix}`),
                extractionEnvelopeDigest: (0, source_contracts_js_1.taskMapContractDigest)(`fixture-meeting-envelope:${revision}:${suffix}`),
                objectRefs: [{
                        kind: "external_reference",
                        referenceDigest: (0, source_contracts_js_1.taskMapContractDigest)(`fixture-meeting-action:${revision}`),
                    }],
            }],
    });
    const snapshot = (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)({
        ownerScopeDigest: owner.ownerScopeDigest,
        producerVersion: meeting_producer_freshness_js_1.TASKMAP_MEETING_PRODUCER_VERSION,
        producedAt,
        meetings: [
            meeting("a", "2026-08-17T10:30:00.000Z"),
            meeting("b", "2026-08-17T11:00:00.000Z"),
        ],
    });
    (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(filePath), { recursive: true, mode: 0o700 });
    (0, node_fs_1.writeFileSync)(filePath, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
}
async function installAcceptedMeetingCandidate(filePath, owner, assessedAt = REQUESTED_AT) {
    const storePath = node_path_1.default.join(owner.taskMapRoot, "native-candidate-acceptance.v1.json");
    const previousStore = await (0, native_candidate_acceptance_js_1.loadTaskMapNativeCandidateAcceptanceStore)({
        storePath,
        expectedOwnerScopeDigest: owner.ownerScopeDigest,
    });
    const result = await (0, meeting_producer_freshness_js_1.loadTaskMapMeetingProducerResult)({
        snapshotPath: filePath,
        assessedAt,
        expectedOwnerScopeDigest: owner.ownerScopeDigest,
    });
    const overlay = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateReview)({
        result,
        previous: null,
        expectedOwnerScopeDigest: owner.ownerScopeDigest,
        assessedAt,
    });
    const row = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateShelf)(result, overlay, assessedAt).candidates[0];
    assert.notEqual(row, undefined);
    const promotion = (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)({
        result,
        overlay,
        previousStore,
        expectedOwnerScopeDigest: owner.ownerScopeDigest,
        assessedAt,
        candidateId: row.candidateId,
        expectedCandidateRevisionDigest: row.candidateRevisionDigest,
        expectedStatementReferenceDigest: row.statementReferenceDigest,
        expectedEvidenceProofDigests: row.evidenceProofDigests,
        idempotencyKeyDigest: (0, source_contracts_js_1.taskMapContractDigest)(`fixture-explicit-meeting-acceptance:${row.candidateId}:`
            + row.candidateRevisionDigest),
        confirmedAt: assessedAt,
    });
    await (0, native_candidate_acceptance_js_1.writeTaskMapNativeCandidateAcceptanceStore)({
        storePath,
        expectedOwnerScopeDigest: owner.ownerScopeDigest,
        store: promotion.store,
    });
}
function sourceCollectors(owner, semanticAdmission) {
    return Object.fromEntries(owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES.map((source) => [
        source,
        source === "meeting_notes"
            ? async () => {
                throw new Error("meeting source intentionally unavailable");
            }
            : async () => ownerSlice(owner, source, source === "agent_session" ? semanticAdmission : undefined),
    ]));
}
function fakeMentionStation() {
    return {
        provider: {
            transport: "claude-cli",
            executable: "/fixture/provider",
            args: [],
            model: "plan2-mention-fixture",
        },
        async run(request) {
            const body = request.promptText.split("<<<BEGIN_UNTRUSTED_AGENT_SESSION_V1>>>")[1]?.split("<<<END_UNTRUSTED_AGENT_SESSION_V1>>>")[0]?.trim() ?? "";
            const text = body.split("\n").find((line) => line.trim().length > 0)
                ?? body;
            return {
                stationId: "mention-extraction-v1",
                model: "plan2-mention-fixture",
                promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                inputDigest: request.inputDigest,
                outputJson: JSON.stringify({
                    mentions: [{
                            text,
                            title: text.slice(0, 96) || "Extracted work",
                            class: "request",
                            actor: "self",
                            confidence: 0.95,
                        }],
                }),
                producedAt: REQUESTED_AT,
                transport: "claude-cli",
            };
        },
    };
}
function fakeTwoRootPlanStation() {
    return {
        provider: {
            transport: "claude-cli",
            executable: "/fixture/provider",
            args: [],
            model: "authoritative-plan2-fixture",
        },
        async run(request) {
            const payload = JSON.parse(request.promptText.split("\n").at(-1) ?? "{}");
            if (request.stationId === "community-title-v1") {
                return {
                    stationId: request.stationId,
                    model: "authoritative-plan2-fixture",
                    promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                    inputDigest: request.inputDigest,
                    outputJson: JSON.stringify({
                        titles: (payload.communities ?? []).map((community, index) => ({
                            baseRootProposalId: community.baseRootProposalId,
                            title: `Plan2 workstream ${index + 1}`,
                        })),
                    }),
                    producedAt: REQUESTED_AT,
                    transport: "claude-cli",
                };
            }
            const nodeIds = (payload.nodes ?? []).map((node) => node.nodeId);
            const midpoint = Math.ceil(nodeIds.length / 2);
            return {
                stationId: "community-grouping-v1",
                model: "authoritative-plan2-fixture",
                promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                inputDigest: request.inputDigest,
                outputJson: JSON.stringify({
                    groups: [
                        { nodeIds: nodeIds.slice(0, midpoint) },
                        { nodeIds: nodeIds.slice(midpoint) },
                    ].filter((group) => group.nodeIds.length > 0),
                }),
                producedAt: REQUESTED_AT,
                transport: "claude-cli",
            };
        },
    };
}
function fakeFallbackPlanStation(mode) {
    return {
        provider: {
            transport: "claude-cli",
            executable: "/fixture/provider",
            args: [],
            model: `authoritative-${mode}-fixture`,
        },
        async run(request) {
            const payload = JSON.parse(request.promptText.split("\n").at(-1) ?? "{}");
            if (request.stationId === "community-title-v1") {
                return {
                    stationId: request.stationId,
                    model: `authoritative-${mode}-fixture`,
                    promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                    inputDigest: request.inputDigest,
                    outputJson: JSON.stringify({
                        titles: (payload.communities ?? []).map((community) => ({
                            baseRootProposalId: community.baseRootProposalId,
                            title: "Mapped Plan2 root",
                        })),
                    }),
                    producedAt: REQUESTED_AT,
                    transport: "claude-cli",
                };
            }
            const nodeIds = (payload.nodes ?? []).map((node) => node.nodeId);
            return {
                stationId: "community-grouping-v1",
                model: `authoritative-${mode}-fixture`,
                promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                inputDigest: request.inputDigest,
                outputJson: JSON.stringify({
                    groups: mode === "partial"
                        ? [{ nodeIds: nodeIds.slice(0, 2) }]
                        : [
                            { nodeIds: nodeIds.slice(0, 2) },
                            { nodeIds: [nodeIds[0], nodeIds[2]] },
                        ],
                }),
                producedAt: REQUESTED_AT,
                transport: "claude-cli",
            };
        },
    };
}
function fakeOneRootPlanStation() {
    return {
        provider: {
            transport: "claude-cli",
            executable: "/fixture/provider",
            args: [],
            model: "authoritative-one-root-fixture",
        },
        async run(request) {
            const payload = JSON.parse(request.promptText.split("\n").at(-1) ?? "{}");
            return {
                stationId: request.stationId,
                model: "authoritative-one-root-fixture",
                promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                inputDigest: request.inputDigest,
                outputJson: request.stationId === "community-title-v1"
                    ? JSON.stringify({
                        titles: (payload.communities ?? []).map((community) => ({
                            baseRootProposalId: community.baseRootProposalId,
                            title: "Shared Plan2 workstream",
                        })),
                    })
                    : JSON.stringify({
                        groups: [{
                                nodeIds: (payload.nodes ?? []).map((node) => node.nodeId),
                            }],
                    }),
                producedAt: REQUESTED_AT,
                transport: "claude-cli",
            };
        },
    };
}
function fakeFiveThemePlanStation() {
    const titles = [
        "Fundraising",
        "Video",
        "Yogacara",
        "Task Map",
        "Landing",
    ];
    return {
        provider: {
            transport: "claude-cli",
            executable: "/fixture/provider",
            args: [],
            model: "authoritative-three-theme-fixture",
        },
        async run(request) {
            const payload = JSON.parse(request.promptText.split("\n").at(-1) ?? "{}");
            return {
                stationId: request.stationId,
                model: "authoritative-three-theme-fixture",
                promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                inputDigest: request.inputDigest,
                outputJson: request.stationId === "community-title-v1"
                    ? JSON.stringify({
                        titles: (payload.communities ?? []).map((community, index) => ({
                            baseRootProposalId: community.baseRootProposalId,
                            title: titles[index],
                        })),
                    })
                    : JSON.stringify({
                        groups: [0, 1, 2, 3, 4].map((index) => ({
                            nodeIds: (payload.nodes ?? []).slice(index * 2, index * 2 + 2).map((node) => node.nodeId),
                        })),
                    }),
                producedAt: REQUESTED_AT,
                transport: "claude-cli",
            };
        },
    };
}
function digestionAwarePlanStation(digestionCalls) {
    const base = fakeFiveThemePlanStation();
    return {
        provider: base.provider,
        async run(request) {
            if (request.stationId !== "community-task-extraction-v1") {
                return base.run(request);
            }
            if (digestionCalls !== undefined)
                digestionCalls.count += 1;
            const body = request.promptText
                .split("<<<BEGIN_UNTRUSTED_COMMUNITY_EVIDENCE_V1>>>\n")[1]
                .split("\n<<<END_UNTRUSTED_COMMUNITY_EVIDENCE_V1>>>")[0];
            const spans = [
                ...body.matchAll(/Implement authoritative Plan2 ([a-z-]+)/g),
            ];
            return {
                stationId: request.stationId,
                model: base.provider.model,
                promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                inputDigest: request.inputDigest,
                outputJson: JSON.stringify({
                    mentions: spans.map((match) => ({
                        text: match[0],
                        title: `Deliver the ${match[1]} milestone`,
                        class: "request",
                        actor: "self",
                        confidence: 0.9,
                    })),
                }),
                producedAt: REQUESTED_AT,
                transport: "claude-cli",
            };
        },
    };
}
function singleCommunityPlanStation() {
    const digestion = digestionAwarePlanStation();
    return {
        provider: digestion.provider,
        async run(request) {
            if (request.stationId === "community-task-extraction-v1") {
                return digestion.run(request);
            }
            const payload = JSON.parse(request.promptText.split("\n").at(-1) ?? "{}");
            return {
                stationId: request.stationId,
                model: digestion.provider.model,
                promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                inputDigest: request.inputDigest,
                outputJson: request.stationId === "community-title-v1"
                    ? JSON.stringify({
                        titles: (payload.communities ?? []).map((community) => ({
                            baseRootProposalId: community.baseRootProposalId,
                            title: "Unified roadmap",
                        })),
                    })
                    : JSON.stringify({
                        groups: [{
                                nodeIds: (payload.nodes ?? []).map((node) => node.nodeId),
                            }],
                    }),
                producedAt: REQUESTED_AT,
                transport: "claude-cli",
            };
        },
    };
}
function serviceForAgentObservations(owner, target, observations, groupingStation, overrides = {}) {
    return new native_refresh_service_js_1.TaskMapNativeRefreshService({
        confirmedOwner: owner,
        runtimeRoot: target.runtimeRoot,
        projectionPath: target.projectionPath,
        currentnessPath: target.currentnessPath,
        collectors: sourceCollectors(owner, admission(owner, observations)),
        nowMs: () => REQUESTED_AT_MS,
        agentSessionExtractionPromptTemplatePath: node_path_1.default.join(process.cwd(), "prompts", "agent-session-extraction-v1.md"),
        createAgentSessionExtractionStation: async () => fakeMentionStation(),
        createCommunityGroupingStation: async () => {
            if (groupingStation === undefined) {
                throw new Error("community grouping fixture intentionally unavailable");
            }
            return groupingStation;
        },
        communityPlanEmbeddingProvider: null,
        agentSessionGraphFeedForTesting: graphFeed(owner, observations),
        ...overrides,
    });
}
(0, node_test_1.afterEach)(() => {
    for (const root of temporaryRoots.splice(0)) {
        (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
    }
});
(0, node_test_1.describe)("Task Map authoritative Plan2 projection integration", () => {
    (0, node_test_1.it)("publishes the transient Plan2 grouping as the only authoritative Agent projection", async () => {
        const owner = (0, confirmed_owner_js_1.confirmedTestOwner)("authoritative-plan2-owner");
        (0, node_fs_1.rmSync)(owner.taskMapRoot, { recursive: true, force: true });
        (0, node_fs_1.mkdirSync)(owner.taskMapRoot, { recursive: true, mode: 0o700 });
        const observations = [
            codexObservation("authoritative-plan2-alpha"),
            codexObservation("authoritative-plan2-beta"),
            codexObservation("authoritative-plan2-gamma"),
            codexObservation("authoritative-plan2-delta"),
        ];
        const legacyTarget = locations("taskmap-authoritative-plan2-legacy-");
        const authoritativeTarget = locations("taskmap-authoritative-plan2-current-");
        (0, node_fs_1.mkdirSync)(authoritativeTarget.runtimeRoot, {
            recursive: true,
            mode: 0o700,
        });
        (0, node_fs_1.writeFileSync)(node_path_1.default.join(authoritativeTarget.runtimeRoot, "taskmap-community-shadow.v1.json"), "{\"obsolete\":true}\n", { mode: 0o600 });
        const legacyResult = await serviceForAgentObservations(owner, legacyTarget, observations).requestRefresh("manual");
        const authoritativeResult = await serviceForAgentObservations(owner, authoritativeTarget, observations, fakeTwoRootPlanStation()).requestRefresh("manual");
        assert.equal(legacyResult.refreshStatus, "published");
        assert.equal(authoritativeResult.refreshStatus, "published");
        const legacyProjection = JSON.parse((0, node_fs_1.readFileSync)(legacyTarget.projectionPath, "utf8"));
        const projectionBytes = (0, node_fs_1.readFileSync)(authoritativeTarget.projectionPath);
        const projection = JSON.parse(projectionBytes.toString("utf8"));
        assert.equal(legacyProjection.roots.length, 4);
        assert.equal(legacyProjection.tasks.length, 4);
        assert.equal(projection.roots.length, 2);
        assert.ok(projection.roots.every((root) => root.title.startsWith("Plan2 workstream ")
            && root.taskIds.length === 2));
        assert.equal(projection.edges.length, 4);
        assert.deepEqual(projection.tasks.map((task) => task.id).sort(), legacyProjection.tasks.map((task) => task.id).sort());
        assert.deepEqual(Object.fromEntries(projection.tasks.map((task) => [
            task.id,
            {
                citations: task.citations,
                originPointerIds: task.originPointerIds,
            },
        ])), Object.fromEntries(legacyProjection.tasks.map((task) => [
            task.id,
            {
                citations: task.citations,
                originPointerIds: task.originPointerIds,
            },
        ])));
        assert.deepEqual(projection.sources, legacyProjection.sources);
        assert.ok(projection.tasks.every((task) => task.reviewState === "proposed" && task.authority === "none"));
        const currentnessBytes = (0, node_fs_1.readFileSync)(authoritativeTarget.currentnessPath);
        const currentness = JSON.parse(currentnessBytes.toString("utf8"));
        assert.equal(currentness.taskDispositions.length, 4);
        assert.ok(currentness.taskDispositions.every((row) => row.disposition === "needs_lifecycle_review"));
        const rankingPath = (0, native_refresh_service_js_1.nativeTaskRankingPath)(authoritativeTarget.projectionPath);
        const rankingBytes = (0, node_fs_1.readFileSync)(rankingPath);
        const ranking = JSON.parse(rankingBytes.toString("utf8"));
        assert.deepEqual(ranking.rankedAcceptedOpen, []);
        const reference = JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(node_path_1.default.dirname(authoritativeTarget.projectionPath), "taskmap-current-generation.v1.json"), "utf8"));
        const generationRoot = node_path_1.default.join(node_path_1.default.dirname(authoritativeTarget.projectionPath), "taskmap-generations", reference.generationId);
        assert.deepEqual((0, node_fs_1.readFileSync)(node_path_1.default.join(generationRoot, "taskmap-projection.v1.json")), projectionBytes);
        assert.deepEqual((0, node_fs_1.readFileSync)(node_path_1.default.join(generationRoot, "taskmap-currentness.v1.json")), currentnessBytes);
        assert.deepEqual((0, node_fs_1.readFileSync)(node_path_1.default.join(generationRoot, "taskmap-task-ranking.v1.json")), rankingBytes);
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(authoritativeTarget.runtimeRoot, "taskmap-community-shadow.v1.json")), false);
    });
    (0, node_test_1.it)("rebuilds fresh Agent work after a verified empty predecessor while preserving fresh-empty retirement", async () => {
        const owner = (0, confirmed_owner_js_1.confirmedTestOwner)("authoritative-empty-recovery-owner");
        (0, node_fs_1.rmSync)(owner.taskMapRoot, { recursive: true, force: true });
        (0, node_fs_1.mkdirSync)(owner.taskMapRoot, { recursive: true, mode: 0o700 });
        const target = locations("taskmap-authoritative-empty-recovery-");
        const first = await serviceForAgentObservations(owner, target, [codexObservation("empty-recovery-initial")], fakeTwoRootPlanStation()).requestRefresh("manual");
        assert.equal(first.refreshStatus, "published");
        assert.equal(JSON.parse((0, node_fs_1.readFileSync)(target.projectionPath, "utf8")).tasks.length, 1);
        const retired = await serviceForAgentObservations(owner, target, [], fakeTwoRootPlanStation()).requestRefresh("manual");
        assert.equal(retired.refreshStatus, "published");
        const retiredProjection = JSON.parse((0, node_fs_1.readFileSync)(target.projectionPath, "utf8"));
        assert.deepEqual(retiredProjection.roots, []);
        assert.deepEqual(retiredProjection.tasks, []);
        const refreshed = await serviceForAgentObservations(owner, target, [codexObservation("empty-recovery-fresh")], fakeTwoRootPlanStation()).requestRefresh("manual");
        assert.equal(refreshed.refreshStatus, "published");
        const projection = JSON.parse((0, node_fs_1.readFileSync)(target.projectionPath, "utf8"));
        assert.equal(projection.roots.length, 1);
        assert.equal(projection.tasks.length, 1);
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(target.runtimeRoot, "taskmap-community-shadow.v1.json")), false);
    });
    (0, node_test_1.it)("replays a verified Plan2 grouping instead of falling back to legacy routes", async () => {
        const owner = (0, confirmed_owner_js_1.confirmedTestOwner)("authoritative-plan2-replay-owner");
        (0, node_fs_1.rmSync)(owner.taskMapRoot, { recursive: true, force: true });
        (0, node_fs_1.mkdirSync)(owner.taskMapRoot, { recursive: true, mode: 0o700 });
        const target = locations("taskmap-authoritative-plan2-replay-");
        const observations = [
            codexObservation("replay-alpha"),
            codexObservation("replay-beta"),
            codexObservation("replay-gamma"),
            codexObservation("replay-delta"),
        ];
        const first = await serviceForAgentObservations(owner, target, observations, fakeTwoRootPlanStation()).requestRefresh("manual");
        assert.equal(first.refreshStatus, "published", JSON.stringify(first));
        const titleStation = fakeTwoRootPlanStation();
        let groupingAttemptCount = 0;
        const replayOnlyStation = {
            provider: titleStation.provider,
            async run(request) {
                if (request.stationId === "community-grouping-v1") {
                    groupingAttemptCount += 1;
                    throw new Error("grouping provider unavailable after replay");
                }
                return titleStation.run(request);
            },
        };
        const second = await serviceForAgentObservations(owner, target, observations, replayOnlyStation).requestRefresh("manual");
        assert.equal(groupingAttemptCount, 0, JSON.stringify(second));
        const projection = JSON.parse((0, node_fs_1.readFileSync)(target.projectionPath, "utf8"));
        assert.equal(projection.roots.length, 2);
        assert.ok(projection.roots.every((root) => root.title.startsWith("Plan2 workstream ")));
    });
    (0, node_test_1.it)("replaces legacy routes only for a usable Plan2 root set and falls back on ambiguity", async () => {
        const observations = [
            codexObservation("fallback-alpha"),
            codexObservation("fallback-beta"),
            codexObservation("fallback-gamma"),
            codexObservation("fallback-delta"),
        ];
        for (const [mode, expectedRootCount, expectedTaskCount] of [
            ["partial", 1, 2],
            ["ambiguous", 4, 4],
        ]) {
            const owner = (0, confirmed_owner_js_1.confirmedTestOwner)(`authoritative-plan2-${mode}-fallback-owner`);
            (0, node_fs_1.rmSync)(owner.taskMapRoot, { recursive: true, force: true });
            (0, node_fs_1.mkdirSync)(owner.taskMapRoot, { recursive: true, mode: 0o700 });
            const target = locations(`taskmap-authoritative-${mode}-fallback-`);
            const result = await serviceForAgentObservations(owner, target, observations, fakeFallbackPlanStation(mode)).requestRefresh("manual");
            assert.equal(result.refreshStatus, "published", JSON.stringify(result));
            const projection = JSON.parse((0, node_fs_1.readFileSync)(target.projectionPath, "utf8"));
            assert.equal(projection.roots.length, expectedRootCount);
            assert.equal(projection.tasks.length, expectedTaskCount);
            assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(target.runtimeRoot, "taskmap-community-shadow.v1.json")), false);
        }
    });
    (0, node_test_1.it)("bounds grouping-station discovery and publishes the legacy fallback when it aborts", async () => {
        const owner = (0, confirmed_owner_js_1.confirmedTestOwner)("authoritative-plan2-deadline-owner");
        (0, node_fs_1.rmSync)(owner.taskMapRoot, { recursive: true, force: true });
        (0, node_fs_1.mkdirSync)(owner.taskMapRoot, { recursive: true, mode: 0o700 });
        const target = locations("taskmap-authoritative-plan2-deadline-");
        const observations = [codexObservation("deadline-fallback")];
        let factoryAborted = false;
        const service = serviceForAgentObservations(owner, target, observations, undefined, {
            communityPlanDeadlineMs: 25,
            createCommunityGroupingStation: (signal) => new Promise((_resolve, reject) => {
                signal?.addEventListener("abort", () => {
                    factoryAborted = true;
                    reject(new Error("grouping discovery aborted"));
                }, { once: true });
            }),
        });
        let guard;
        const result = await Promise.race([
            service.requestRefresh("manual"),
            new Promise((resolve) => {
                guard = setTimeout(() => resolve("timed_out"), 2_000);
            }),
        ]);
        if (guard !== undefined)
            clearTimeout(guard);
        assert.notEqual(result, "timed_out");
        assert.equal(factoryAborted, true);
        assert.equal(typeof result === "string" ? result : result.refreshStatus, "published");
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(target.runtimeRoot, "taskmap-community-shadow.v1.json")), false);
    });
    (0, node_test_1.it)("reruns Plan2 when graph-only history outside the 128-row producer head changes", async () => {
        const owner = (0, confirmed_owner_js_1.confirmedTestOwner)("authoritative-plan2-graph-binding-owner");
        (0, node_fs_1.rmSync)(owner.taskMapRoot, { recursive: true, force: true });
        (0, node_fs_1.mkdirSync)(owner.taskMapRoot, { recursive: true, mode: 0o700 });
        const target = locations("taskmap-authoritative-plan2-graph-binding-");
        const sessionRoot = node_path_1.default.join(target.root, "sessions");
        (0, node_fs_1.mkdirSync)(sessionRoot, { recursive: true, mode: 0o700 });
        const oldestModifiedAt = REQUESTED_AT_MS - 10_000_000;
        let oldestPath = "";
        for (let index = 0; index < 129; index += 1) {
            const label = index === 0
                ? "graph-only-history-a"
                : `producer-head-${String(index).padStart(3, "0")}`;
            const filePath = node_path_1.default.join(sessionRoot, `${index}.jsonl`);
            (0, node_fs_1.writeFileSync)(filePath, codexObservation(label).rawJsonl, {
                mode: 0o600,
            });
            const modifiedAt = new Date(oldestModifiedAt + index * 1_000);
            (0, node_fs_1.utimesSync)(filePath, modifiedAt, modifiedAt);
            if (index === 0)
                oldestPath = filePath;
        }
        const snapshotPath = node_path_1.default.join(target.root, "agent-snapshot.json");
        let groupingCalls = 0;
        const groupingStation = fakeTwoRootPlanStation();
        const countedStation = {
            ...groupingStation,
            async run(request) {
                if (request.stationId === "community-grouping-v1") {
                    groupingCalls += 1;
                }
                return groupingStation.run(request);
            },
        };
        const makeService = () => new native_refresh_service_js_1.TaskMapNativeRefreshService({
            confirmedOwner: owner,
            runtimeRoot: target.runtimeRoot,
            projectionPath: target.projectionPath,
            currentnessPath: target.currentnessPath,
            sourcePaths: {
                agentSessionRoots: [{ sourceLabel: "codex", rootPath: sessionRoot }],
                agentSessionProducerSnapshotPath: snapshotPath,
            },
            collectors: {
                meeting_notes: async () => {
                    throw new Error("meeting source intentionally unavailable");
                },
                calendar: async () => ownerSlice(owner, "calendar"),
                body: async () => ownerSlice(owner, "body"),
            },
            nowMs: () => REQUESTED_AT_MS,
            agentSessionExtractionPromptTemplatePath: node_path_1.default.join(process.cwd(), "prompts", "agent-session-extraction-v1.md"),
            createAgentSessionExtractionStation: async () => fakeMentionStation(),
            createCommunityGroupingStation: async () => countedStation,
            communityPlanEmbeddingProvider: null,
        });
        const first = await makeService().requestRefresh("manual");
        assert.equal(first.refreshStatus, "published", JSON.stringify(first));
        assert.equal(groupingCalls, 1);
        const originalBytes = (0, node_fs_1.readFileSync)(oldestPath);
        const replacementBytes = Buffer.from(codexObservation("graph-only-history-b").rawJsonl);
        assert.equal(replacementBytes.length, originalBytes.length);
        (0, node_fs_1.writeFileSync)(oldestPath, replacementBytes, { mode: 0o600 });
        const originalMtime = new Date(oldestModifiedAt);
        (0, node_fs_1.utimesSync)(oldestPath, originalMtime, originalMtime);
        const second = await makeService().requestRefresh("manual");
        assert.equal(groupingCalls, 2);
        assert.notEqual(second.refreshStatus, "unavailable", JSON.stringify(second));
    });
    (0, node_test_1.it)("retains a degraded member across repeated refreshes of one shared Plan2 root", async () => {
        const owner = (0, confirmed_owner_js_1.confirmedTestOwner)("authoritative-plan2-retention-owner");
        (0, node_fs_1.rmSync)(owner.taskMapRoot, { recursive: true, force: true });
        (0, node_fs_1.mkdirSync)(owner.taskMapRoot, { recursive: true, mode: 0o700 });
        const target = locations("taskmap-authoritative-plan2-retention-");
        const planStation = fakeOneRootPlanStation();
        const observations = (revision) => [
            codexObservation("retain-a", "retain-a-repository", `Prepared retain-a revision ${revision}`),
            codexObservation("retain-b", "retain-b-repository", `Prepared retain-b revision ${revision}`),
        ];
        const first = await serviceForAgentObservations(owner, target, observations(1), planStation).requestRefresh("manual");
        assert.equal(first.refreshStatus, "published", JSON.stringify(first));
        const firstProjection = JSON.parse((0, node_fs_1.readFileSync)(target.projectionPath, "utf8"));
        assert.equal(firstProjection.roots.length, 1);
        assert.equal(firstProjection.tasks.length, 2);
        const retainedTaskId = firstProjection.tasks.find((task) => task.title.includes("retain-b")).id;
        const selectiveMentionStation = {
            ...fakeMentionStation(),
            async run(request) {
                if (request.promptText.includes("retain-b")) {
                    throw new Error("retain-b extraction intentionally degraded");
                }
                return fakeMentionStation().run(request);
            },
        };
        for (const revision of [2, 3]) {
            const result = await serviceForAgentObservations(owner, target, observations(revision), planStation, {
                createAgentSessionExtractionStation: async () => selectiveMentionStation,
            }).requestRefresh("manual");
            assert.notEqual(result.refreshStatus, "unavailable", JSON.stringify(result));
            const projection = JSON.parse((0, node_fs_1.readFileSync)(target.projectionPath, "utf8"));
            assert.equal(projection.roots.length, 1);
            assert.equal(projection.tasks.some((task) => task.id === retainedTaskId), true);
            assert.equal(projection.roots[0].memberObjectRefs.length, 2);
        }
    });
    (0, node_test_1.it)("digests each historical community into semantic leaves and replays them byte-identically", async () => {
        const owner = (0, confirmed_owner_js_1.confirmedTestOwner)("authoritative-plan2-history-owner");
        (0, node_fs_1.rmSync)(owner.taskMapRoot, { recursive: true, force: true });
        (0, node_fs_1.mkdirSync)(owner.taskMapRoot, { recursive: true, mode: 0o700 });
        const target = locations("taskmap-authoritative-plan2-history-");
        const historical = [
            codexObservation("fundraising-a"),
            codexObservation("fundraising-b"),
            codexObservation("video-a"),
            codexObservation("video-b"),
            codexObservation("yogacara-a"),
            codexObservation("yogacara-b"),
            codexObservation("task-map-a"),
            codexObservation("task-map-b"),
            codexObservation("landing-a"),
            codexObservation("landing-b"),
        ];
        const digestionCalls = { count: 0 };
        const result = await serviceForAgentObservations(owner, target, [codexObservation("current-only-unmapped")], digestionAwarePlanStation(digestionCalls), {
            agentSessionGraphFeedForTesting: graphFeed(owner, historical),
        }).requestRefresh("manual");
        assert.equal(result.refreshStatus, "published", JSON.stringify(result));
        assert.equal(digestionCalls.count, 5);
        const projectionBytes = (0, node_fs_1.readFileSync)(target.projectionPath);
        const projection = JSON.parse(projectionBytes.toString("utf8"));
        const historicalRoots = projection.roots.filter((root) => [
            "Fundraising",
            "Video",
            "Yogacara",
            "Task Map",
            "Landing",
        ].includes(root.title));
        assert.deepEqual(historicalRoots.map((root) => root.title).sort(), ["Fundraising", "Landing", "Task Map", "Video", "Yogacara"]);
        assert.equal(projection.roots.length, 5);
        const taskById = new Map(projection.tasks.map((task) => [task.id, task]));
        // Each historical theme digests to one leaf per unique actionable
        // mention (two per fixture theme), titled as imperative work items
        // rather than copied root titles or raw session fragments.
        assert.ok(historicalRoots.every((root) => root.taskIds.length === 2 && root.citations.length > 0));
        assert.equal(projection.tasks.length, 10);
        for (const root of historicalRoots) {
            const titles = root.taskIds.map((taskId) => taskById.get(taskId).title);
            for (const title of titles) {
                assert.match(title, /^Deliver the [a-z-]+ milestone$/);
            }
            assert.deepEqual(root.summary.split("; ").sort(), [...titles].sort());
        }
        assert.ok(projection.tasks.every((task) => task.reviewState === "proposed"
            && task.authority === "none"
            && task.citations.length > 0));
        assert.ok(projection.tasks.every((task) => !task.id.startsWith("agent-history-")));
        assert.ok(projection.sources.every((source) => !source.id.startsWith("agent-history-")));
        assert.notEqual(projection.brain.provider, "taskmap-native-agent-plan2-composer");
        const currentness = JSON.parse((0, node_fs_1.readFileSync)(target.currentnessPath, "utf8"));
        assert.ok(currentness.taskDispositions.every((row) => row.disposition === "needs_lifecycle_review"));
        const ranking = JSON.parse((0, node_fs_1.readFileSync)((0, native_refresh_service_js_1.nativeTaskRankingPath)(target.projectionPath), "utf8"));
        assert.deepEqual(ranking.rankedAcceptedOpen, []);
        const reference = JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(node_path_1.default.dirname(target.projectionPath), "taskmap-current-generation.v1.json"), "utf8"));
        assert.deepEqual((0, node_fs_1.readFileSync)(node_path_1.default.join(node_path_1.default.dirname(target.projectionPath), "taskmap-generations", reference.generationId, "taskmap-projection.v1.json")), projectionBytes);
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(target.runtimeRoot, "taskmap-community-shadow.v1.json")), false);
        // Determinism gate: an identical second refresh must not change the
        // published generation and must never consult the digestion station.
        const replayStation = digestionAwarePlanStation();
        const replayOnly = {
            provider: replayStation.provider,
            async run(request) {
                if (request.stationId === "community-task-extraction-v1"
                    || request.stationId === "community-title-v1") {
                    throw new Error(`${request.stationId} must replay from disk`);
                }
                return replayStation.run(request);
            },
        };
        const second = await serviceForAgentObservations(owner, target, [codexObservation("current-only-unmapped")], replayOnly, {
            agentSessionGraphFeedForTesting: graphFeed(owner, historical),
        }).requestRefresh("manual");
        assert.deepEqual((0, node_fs_1.readFileSync)(target.projectionPath), projectionBytes, JSON.stringify(second));
        const secondReference = JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(node_path_1.default.dirname(target.projectionPath), "taskmap-current-generation.v1.json"), "utf8"));
        assert.equal(secondReference.generationId, reference.generationId);
        // A changed current session forces a rebuild; the historical digestion
        // must replay from recorded envelopes without a live station and keep
        // every semantic leaf identical.
        const third = await serviceForAgentObservations(owner, target, [codexObservation("current-only-unmapped-b")], replayOnly, {
            agentSessionGraphFeedForTesting: graphFeed(owner, historical),
        }).requestRefresh("manual");
        assert.equal(third.refreshStatus, "published", JSON.stringify(third));
        const thirdProjection = JSON.parse((0, node_fs_1.readFileSync)(target.projectionPath, "utf8"));
        assert.deepEqual(thirdProjection.tasks.map((task) => task.id).sort(), projection.tasks.map((task) => task.id).sort());
        assert.deepEqual(thirdProjection.roots.map((root) => root.title).sort(), projection.roots.map((root) => root.title).sort());
    });
    (0, node_test_1.it)("preserves the previous semantic generation while the Plan2 layer is degraded and heals afterward", async () => {
        const owner = (0, confirmed_owner_js_1.confirmedTestOwner)("authoritative-plan2-preserve-owner");
        (0, node_fs_1.rmSync)(owner.taskMapRoot, { recursive: true, force: true });
        (0, node_fs_1.mkdirSync)(owner.taskMapRoot, { recursive: true, mode: 0o700 });
        const target = locations("taskmap-authoritative-plan2-preserve-");
        const historical = [
            codexObservation("fundraising-a"),
            codexObservation("fundraising-b"),
            codexObservation("video-a"),
            codexObservation("video-b"),
            codexObservation("yogacara-a"),
            codexObservation("yogacara-b"),
            codexObservation("task-map-a"),
            codexObservation("task-map-b"),
            codexObservation("landing-a"),
            codexObservation("landing-b"),
        ];
        const first = await serviceForAgentObservations(owner, target, [codexObservation("current-only-unmapped")], digestionAwarePlanStation(), {
            agentSessionGraphFeedForTesting: graphFeed(owner, historical),
        }).requestRefresh("manual");
        assert.equal(first.refreshStatus, "published", JSON.stringify(first));
        const firstProjection = JSON.parse((0, node_fs_1.readFileSync)(target.projectionPath, "utf8"));
        assert.equal(firstProjection.roots.length, 5);
        assert.equal(firstProjection.tasks.length, 10);
        // The feed changes (grouping replay misses) while the grouping station
        // is down: the collapsed rebuild must NOT replace the semantic tree.
        const changedHistorical = [...historical, codexObservation("video-c")];
        const deadGroupingStation = {
            provider: digestionAwarePlanStation().provider,
            async run(request) {
                if (request.stationId === "community-grouping-v1") {
                    throw new Error("grouping station intentionally down");
                }
                return digestionAwarePlanStation().run(request);
            },
        };
        // The preserved candidate publishes no byte change, so the surfaced
        // status may report the pre-existing stale-meeting no-op validation;
        // the gate is that the semantic tree on disk survives untouched.
        await serviceForAgentObservations(owner, target, [codexObservation("current-only-unmapped-degraded")], deadGroupingStation, {
            agentSessionGraphFeedForTesting: graphFeed(owner, changedHistorical),
        }).requestRefresh("manual");
        const preservedProjection = JSON.parse((0, node_fs_1.readFileSync)(target.projectionPath, "utf8"));
        assert.deepEqual(preservedProjection.roots.map((root) => root.title).sort(), firstProjection.roots.map((root) => root.title).sort());
        assert.deepEqual(preservedProjection.tasks.map((task) => task.id).sort(), firstProjection.tasks.map((task) => task.id).sort());
        // The station comes back: the layer heals and republishes a live tree.
        const healed = await serviceForAgentObservations(owner, target, [codexObservation("current-only-unmapped-healed")], digestionAwarePlanStation(), {
            agentSessionGraphFeedForTesting: graphFeed(owner, changedHistorical),
        }).requestRefresh("manual");
        assert.notEqual(healed.refreshStatus, "unavailable", JSON.stringify(healed));
        const healedProjection = JSON.parse((0, node_fs_1.readFileSync)(target.projectionPath, "utf8"));
        assert.equal(healedProjection.roots.length >= 5, true);
        assert.equal(healedProjection.tasks.length >= 10, true);
    });
    (0, node_test_1.it)("reuses a published community identity across twenty-percent member drift", async () => {
        const owner = (0, confirmed_owner_js_1.confirmedTestOwner)("authoritative-plan2-identity-reuse-owner");
        (0, node_fs_1.rmSync)(owner.taskMapRoot, { recursive: true, force: true });
        (0, node_fs_1.mkdirSync)(owner.taskMapRoot, { recursive: true, mode: 0o700 });
        const target = locations("taskmap-authoritative-plan2-identity-reuse-");
        const firstMembers = ["a", "b", "c", "d", "e"].map((label) => codexObservation(`identity-${label}`));
        const first = await serviceForAgentObservations(owner, target, [codexObservation("identity-current-a")], singleCommunityPlanStation(), { agentSessionGraphFeedForTesting: graphFeed(owner, firstMembers) }).requestRefresh("manual");
        assert.equal(first.refreshStatus, "published", JSON.stringify(first));
        const firstProjection = JSON.parse((0, node_fs_1.readFileSync)(target.projectionPath, "utf8"));
        const firstCommunityRoot = firstProjection.roots.find((root) => root.memberObjectRefs.some((ref) => ref.startsWith("community:")));
        assert.notEqual(firstCommunityRoot, undefined, JSON.stringify(firstProjection));
        const firstDigestion = JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(target.runtimeRoot, native_refresh_service_js_1.TASKMAP_COMMUNITY_TASK_DIGESTION_REPORT_FILENAME), "utf8"));
        assert.equal(firstDigestion.roots.length, 1);
        const driftedMembers = ["a", "b", "c", "d", "f"].map((label) => codexObservation(`identity-${label}`));
        const second = await serviceForAgentObservations(owner, target, [codexObservation("identity-current-b")], singleCommunityPlanStation(), { agentSessionGraphFeedForTesting: graphFeed(owner, driftedMembers) }).requestRefresh("manual");
        assert.equal(second.refreshStatus, "published", JSON.stringify(second));
        const secondProjection = JSON.parse((0, node_fs_1.readFileSync)(target.projectionPath, "utf8"));
        const secondCommunityRoot = secondProjection.roots.find((root) => root.memberObjectRefs.some((ref) => ref.startsWith("community:")));
        assert.equal(secondCommunityRoot?.id, firstCommunityRoot.id);
        const secondDigestion = JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(target.runtimeRoot, native_refresh_service_js_1.TASKMAP_COMMUNITY_TASK_DIGESTION_REPORT_FILENAME), "utf8"));
        assert.deepEqual(secondDigestion.roots.map((root) => root.rootProposalId), firstDigestion.roots.map((root) => root.rootProposalId));
        assert.notEqual(secondDigestion.roots[0].rootProposalId, firstCommunityRoot.id, "the opaque Plan2 root identity survives projection ID remapping");
    });
    (0, node_test_1.it)("updates fresh Meeting work while retaining a mixed predecessor community subtree when Agent refresh degrades", async () => {
        const owner = (0, confirmed_owner_js_1.confirmedTestOwner)("authoritative-plan2-mixed-guard-owner");
        (0, node_fs_1.rmSync)(owner.taskMapRoot, { recursive: true, force: true });
        (0, node_fs_1.mkdirSync)(owner.taskMapRoot, { recursive: true, mode: 0o700 });
        const target = locations("taskmap-authoritative-plan2-mixed-guard-");
        const meetingSnapshotPath = node_path_1.default.join(target.root, "meeting-snapshot.json");
        const historical = [
            codexObservation("fundraising-a"),
            codexObservation("fundraising-b"),
            codexObservation("video-a"),
            codexObservation("video-b"),
            codexObservation("yogacara-a"),
            codexObservation("yogacara-b"),
            codexObservation("task-map-a"),
            codexObservation("task-map-b"),
            codexObservation("landing-a"),
            codexObservation("landing-b"),
        ];
        writeMeetingSnapshot(meetingSnapshotPath, owner, "Prepare the first meeting artifact", "meeting-revision-1");
        await installAcceptedMeetingCandidate(meetingSnapshotPath, owner);
        const first = await serviceForAgentObservations(owner, target, [codexObservation("mixed-guard-current")], digestionAwarePlanStation(), {
            meetingProducerSnapshotPath: meetingSnapshotPath,
            agentSessionGraphFeedForTesting: graphFeed(owner, historical),
            collectors: {
                agent_session: async () => ownerSlice(owner, "agent_session", admission(owner, [codexObservation("mixed-guard-current")])),
                calendar: async () => ownerSlice(owner, "calendar"),
                body: async () => ownerSlice(owner, "body"),
            },
        }).requestRefresh("manual");
        assert.equal(first.refreshStatus, "published", JSON.stringify(first));
        const firstProjection = JSON.parse((0, node_fs_1.readFileSync)(target.projectionPath, "utf8"));
        const firstCommunityRootIds = new Set(firstProjection.roots
            .filter((root) => root.memberObjectRefs.some((ref) => ref.startsWith("community:")))
            .map((root) => root.id));
        assert.equal(firstCommunityRootIds.size > 0, true);
        assert.equal(firstProjection.tasks.some((task) => task.title === "Prepare the first meeting artifact"), true, JSON.stringify({
            first,
            titles: firstProjection.tasks.map((task) => task.title),
        }));
        const firstCommunityTasks = firstProjection.tasks
            .filter((task) => firstCommunityRootIds.has(task.rootId))
            .sort((left, right) => left.id.localeCompare(right.id));
        const firstCommunityEdges = firstProjection.edges
            .filter((edge) => firstCommunityRootIds.has(edge.from)
            || firstCommunityRootIds.has(edge.to))
            .sort((left, right) => left.id.localeCompare(right.id));
        const firstCommunityRoots = firstProjection.roots
            .filter((root) => firstCommunityRootIds.has(root.id))
            .sort((left, right) => left.id.localeCompare(right.id));
        const extractedCommunity = (0, native_refresh_service_js_1.agentCommunitySubtreeOf)(firstProjection);
        assert.notEqual(extractedCommunity, null);
        assert.deepEqual(extractedCommunity.roots.map((root) => root.id).sort(), [...firstCommunityRootIds].sort());
        assert.ok(extractedCommunity.sources.every((source) => source.sourceKind === "codex_session"
            || source.sourceKind === "claude_session"));
        assert.equal(extractedCommunity.tasks.some((task) => task.title === "Prepare the first meeting artifact"), false);
        assert.notEqual((0, native_refresh_service_js_1.agentCommunitySubtreeOf)(extractedCommunity), null);
        assert.equal((0, native_refresh_service_js_1.agentCommunitySubtreeOf)({
            ...firstProjection,
            roots: firstProjection.roots.map((root) => ({
                ...root,
                memberObjectRefs: root.memberObjectRefs.filter((ref) => !ref.startsWith("community:")),
            })),
        }), null);
        const previousAcceptedRoots = (0, native_refresh_service_js_1.previousAcceptedCommunityRootsFromProjection)(firstProjection, graphFeed(owner, historical));
        assert.deepEqual(previousAcceptedRoots.map((root) => root.rootProposalId).sort(), firstCommunityRoots.map((root) => root.memberObjectRefs
            .find((ref) => ref.startsWith("community:root:"))
            .slice("community:root:".length)).sort());
        assert.ok(previousAcceptedRoots.every((root) => root.memberNodeIds.length > 0));
        assert.deepEqual((0, native_refresh_service_js_1.previousAcceptedCommunityRootsFromProjection)(firstProjection, graphFeed(owner, historical.slice(-1))), previousAcceptedRoots, "previous membership must survive when old episodes disappear from the current feed");
        assert.deepEqual((0, native_refresh_service_js_1.previousAcceptedCommunityRootsFromProjection)(null, graphFeed(owner, historical)), []);
        const assertCommunityPreserved = (projection) => {
            assert.deepEqual(projection.roots
                .filter((root) => firstCommunityRootIds.has(root.id))
                .sort((left, right) => left.id.localeCompare(right.id)), firstCommunityRoots);
            assert.deepEqual(projection.tasks
                .filter((task) => firstCommunityRootIds.has(task.rootId))
                .sort((left, right) => left.id.localeCompare(right.id)), firstCommunityTasks);
            assert.deepEqual(projection.edges
                .filter((edge) => firstCommunityRootIds.has(edge.from)
                || firstCommunityRootIds.has(edge.to))
                .sort((left, right) => left.id.localeCompare(right.id)), firstCommunityEdges);
        };
        (0, node_fs_1.rmSync)(node_path_1.default.join(owner.taskMapRoot, "llm-envelopes", "community-grouping-v1"), { recursive: true, force: true });
        writeMeetingSnapshot(meetingSnapshotPath, owner, "Prepare the updated meeting artifact", "meeting-revision-2");
        await installAcceptedMeetingCandidate(meetingSnapshotPath, owner, new Date(REQUESTED_AT_MS + 60_000).toISOString());
        const semanticDegraded = await new native_refresh_service_js_1.TaskMapNativeRefreshService({
            confirmedOwner: owner,
            runtimeRoot: target.runtimeRoot,
            projectionPath: target.projectionPath,
            currentnessPath: target.currentnessPath,
            meetingProducerSnapshotPath: meetingSnapshotPath,
            collectors: {
                agent_session: async () => {
                    throw new Error("Agent provider intentionally unavailable");
                },
                calendar: async () => ownerSlice(owner, "calendar"),
                body: async () => ownerSlice(owner, "body"),
            },
            nowMs: () => REQUESTED_AT_MS + 60_000,
            agentSessionExtractionPromptTemplatePath: node_path_1.default.join(process.cwd(), "prompts", "agent-session-extraction-v1.md"),
            createAgentSessionExtractionStation: async () => fakeMentionStation(),
            createCommunityGroupingStation: async () => {
                throw new Error("community station intentionally unavailable");
            },
            communityPlanEmbeddingProvider: null,
            agentSessionGraphFeedForTesting: graphFeed(owner, historical),
        }).requestRefresh("manual");
        assert.notEqual(semanticDegraded.refreshStatus, "unavailable", JSON.stringify(semanticDegraded));
        assert.equal(semanticDegraded.sourceStatuses.find((row) => row.source === "agent_session")?.disposition, "retained_last_good");
        const semanticDegradedProjection = JSON.parse((0, node_fs_1.readFileSync)(target.projectionPath, "utf8"));
        assert.equal(semanticDegradedProjection.tasks.some((task) => task.title === "Prepare the updated meeting artifact"), true);
        assertCommunityPreserved(semanticDegradedProjection);
        (0, node_fs_1.rmSync)(node_path_1.default.join(target.runtimeRoot, "taskmap-agent-session-extraction-report.v1.json"), { force: true });
        (0, node_fs_1.rmSync)(node_path_1.default.join(owner.taskMapRoot, "llm-envelopes", "mention-extraction-v1", "agent-session"), { recursive: true, force: true });
        writeMeetingSnapshot(meetingSnapshotPath, owner, "Prepare the third meeting artifact", "meeting-revision-3");
        await installAcceptedMeetingCandidate(meetingSnapshotPath, owner, new Date(REQUESTED_AT_MS + 120_000).toISOString());
        const degraded = await new native_refresh_service_js_1.TaskMapNativeRefreshService({
            confirmedOwner: owner,
            runtimeRoot: target.runtimeRoot,
            projectionPath: target.projectionPath,
            currentnessPath: target.currentnessPath,
            meetingProducerSnapshotPath: meetingSnapshotPath,
            collectors: {
                agent_session: async () => {
                    throw new Error("Agent provider intentionally unavailable");
                },
                calendar: async () => ownerSlice(owner, "calendar"),
                body: async () => ownerSlice(owner, "body"),
            },
            nowMs: () => REQUESTED_AT_MS + 120_000,
            agentSessionExtractionPromptTemplatePath: node_path_1.default.join(process.cwd(), "prompts", "agent-session-extraction-v1.md"),
            createAgentSessionExtractionStation: async () => {
                throw new Error("Agent extraction station intentionally unavailable");
            },
            createCommunityGroupingStation: async () => {
                throw new Error("community station intentionally unavailable");
            },
            communityPlanEmbeddingProvider: null,
        }).requestRefresh("manual");
        assert.notEqual(degraded.refreshStatus, "unavailable", JSON.stringify(degraded));
        assert.equal(degraded.sourceStatuses.find((row) => row.source === "agent_session")
            ?.disposition, "retained_last_good");
        const secondProjection = JSON.parse((0, node_fs_1.readFileSync)(target.projectionPath, "utf8"));
        assert.equal(secondProjection.tasks.some((task) => task.title === "Prepare the third meeting artifact"), true, JSON.stringify({ degraded, titles: secondProjection.tasks.map((task) => task.title) }));
        assertCommunityPreserved(secondProjection);
    });
    (0, node_test_1.it)("reports unavailable when every historical root lacks a semantic task", async () => {
        const owner = (0, confirmed_owner_js_1.confirmedTestOwner)("authoritative-plan2-degraded-owner");
        (0, node_fs_1.rmSync)(owner.taskMapRoot, { recursive: true, force: true });
        (0, node_fs_1.mkdirSync)(owner.taskMapRoot, { recursive: true, mode: 0o700 });
        const target = locations("taskmap-authoritative-plan2-degraded-");
        const historical = [
            codexObservation("fundraising-a"),
            codexObservation("fundraising-b"),
            codexObservation("video-a"),
            codexObservation("video-b"),
            codexObservation("yogacara-a"),
            codexObservation("yogacara-b"),
            codexObservation("task-map-a"),
            codexObservation("task-map-b"),
            codexObservation("landing-a"),
            codexObservation("landing-b"),
        ];
        // The base fixture answers digestion requests with grouping-shaped
        // output, so every root's digestion degrades. Taskless digestion is not
        // semantic success: publish neither placeholder leaves nor an empty map.
        const result = await serviceForAgentObservations(owner, target, [codexObservation("current-only-unmapped")], fakeFiveThemePlanStation(), {
            agentSessionGraphFeedForTesting: graphFeed(owner, historical),
        }).requestRefresh("manual");
        assert.equal(result.refreshStatus, "unavailable", JSON.stringify(result));
        assert.equal(result.publicationVerified, false);
        assert.equal(result.publicationBlockReason, "semantic_provider_unavailable");
        assert.equal((0, node_fs_1.existsSync)(target.projectionPath), false);
    });
});
