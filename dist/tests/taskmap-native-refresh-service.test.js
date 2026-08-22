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
const node_crypto_1 = require("node:crypto");
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const internal_server_js_1 = require("../src/engine/internal-server.js");
const oura_taskmap_context_js_1 = require("../src/health/oura-taskmap-context.js");
const meeting_producer_freshness_js_1 = require("../src/engine/taskmap/meeting-producer-freshness.js");
const calendar_producer_freshness_js_1 = require("../src/engine/taskmap/calendar-producer-freshness.js");
const agent_session_producer_freshness_js_1 = require("../src/engine/taskmap/agent-session-producer-freshness.js");
const agent_session_semantic_admission_js_1 = require("../src/engine/taskmap/agent-session-semantic-admission.js");
const physiological_source_snapshot_js_1 = require("../src/engine/taskmap/physiological-source-snapshot.js");
const native_refresh_service_js_1 = require("../src/engine/taskmap/native-refresh-service.js");
const ready_frontier_js_1 = require("../src/engine/taskmap/ready-frontier.js");
const task_ranking_publication_js_1 = require("../src/engine/taskmap/task-ranking-publication.js");
const owner_scope_js_1 = require("../src/engine/taskmap/owner-scope.js");
const native_semantic_builder_adapter_js_1 = require("../src/engine/taskmap/native-semantic-builder-adapter.js");
const native_candidate_review_js_1 = require("../src/engine/taskmap/native-candidate-review.js");
const agent_session_candidate_adapter_js_1 = require("../src/engine/taskmap/agent-session-candidate-adapter.js");
const calendar_candidate_adapter_js_1 = require("../src/engine/taskmap/calendar-candidate-adapter.js");
const taskmap_agent_session_extraction_fixture_js_1 = require("./taskmap-agent-session-extraction-fixture.js");
const agent_session_refresh_llm_replay_js_1 = require("../src/engine/taskmap/agent-session-refresh-llm-replay.js");
const native_candidate_acceptance_js_1 = require("../src/engine/taskmap/native-candidate-acceptance.js");
const owner_refresh_coordinator_js_1 = require("../src/engine/taskmap/owner-refresh-coordinator.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const harness_js_1 = require("../src/engine/taskmap/harness.js");
const native_predecessor_evidence_js_1 = require("../src/engine/taskmap/native-predecessor-evidence.js");
const strategy_source_adapter_js_1 = require("../src/engine/taskmap/strategy-source-adapter.js");
const exact_provenance_companion_js_1 = require("../src/engine/taskmap/exact-provenance-companion.js");
const llm_station_js_1 = require("../src/engine/taskmap/llm-station.js");
const llm_proposal_surface_js_1 = require("../src/engine/taskmap/llm-proposal-surface.js");
const confirmed_owner_js_1 = require("./support/confirmed-owner.js");
const servers = [];
const TEST_OWNER_SCOPE = (0, owner_scope_js_1.createTaskMapOwnerScope)("14802294-BEED-480E-ABF6-7E3703FA25CD", "/tmp/taskmap-native-refresh-service-tests");
class TaskMapNativeRefreshService extends native_refresh_service_js_1.TaskMapNativeRefreshService {
    constructor(options = {}) {
        const { ownerUserId, confirmedOwner = (0, confirmed_owner_js_1.confirmedTestOwner)(ownerUserId ?? TEST_OWNER_SCOPE.userId), collectors, ...rest } = options;
        const adaptedCollectors = ownerUserId === undefined
            ? collectors
            : Object.fromEntries(Object.entries(collectors ?? {}).map(([source, collect]) => [
                source,
                async () => {
                    const slice = await collect();
                    const value = {
                        ...slice.value,
                        ownerScopeDigest: confirmedOwner.ownerScopeDigest,
                    };
                    return {
                        ...slice,
                        ownerScopeDigest: confirmedOwner.ownerScopeDigest,
                        value,
                        sliceDigest: (0, source_contracts_js_1.taskMapContractDigest)(value),
                    };
                },
            ]));
        super({
            ...rest,
            confirmedOwner,
            createAgentSessionExtractionStation: rest.createAgentSessionExtractionStation
                ?? testMentionExtractionStation,
            createCalendarExtractionStation: rest.createCalendarExtractionStation
                ?? testMentionExtractionStation,
            ...(adaptedCollectors === undefined
                ? {}
                : { collectors: adaptedCollectors }),
        });
    }
}
async function testMentionExtractionStation() {
    return {
        provider: {
            transport: "claude-cli",
            executable: "/fixture/provider",
            args: [],
            model: "native-refresh-fixture-model",
        },
        async run(request) {
            const delimiter = request.promptText.includes("AGENT_SESSION_V1")
                ? "AGENT_SESSION_V1"
                : "CALENDAR_SEGMENT_V1";
            const body = request.promptText.split(`<<<BEGIN_UNTRUSTED_${delimiter}>>>`)[1]?.split(`<<<END_UNTRUSTED_${delimiter}>>>`)[0]?.trim() ?? "";
            const text = body.split("\n").find((line) => line.trim().length > 0)
                ?? body;
            return {
                stationId: "mention-extraction-v1",
                model: "native-refresh-fixture-model",
                promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                inputDigest: request.inputDigest,
                outputJson: JSON.stringify({
                    mentions: [{
                            text,
                            title: boundedFixtureTitle(text),
                            class: "request",
                            actor: "self",
                            confidence: 0.9,
                        }],
                }),
                producedAt: "2026-07-30T08:01:00.000Z",
                transport: "claude-cli",
            };
        },
    };
}
function boundedFixtureTitle(value) {
    return value.slice(0, 96) || "Extracted work";
}
const CURRENT_OURA_TOKEN = {
    access_token: "service-test-access-token",
    refresh_token: "service-test-refresh-token",
    expires_at: Date.parse("2027-01-01T00:00:00.000Z"),
    token_type: "Bearer",
};
async function emptyLiveOuraContext(options) {
    const emptyPage = async () => ({ data: [], next_token: null });
    const dependencies = {
        loadToken: () => CURRENT_OURA_TOKEN,
        assertOwnerBinding: () => { },
        refreshAccessToken: async () => {
            throw new Error("the service test token is current");
        },
        fetchDailyReadiness: emptyPage,
        fetchDailySleep: emptyPage,
        fetchDailyActivity: emptyPage,
        fetchSleep: emptyPage,
        fetchHeartRate: emptyPage,
    };
    return (0, oura_taskmap_context_js_1.fetchOuraTaskMapContext)(options, dependencies);
}
async function classifiedLiveOuraContext(options, targetScore = 60) {
    const rows = Array.from({ length: 8 }, (_, index) => ({
        day: `2026-07-${String(21 + index).padStart(2, "0")}`,
        score: index < 7 ? 80 : targetScore,
    }));
    const emptyPage = async () => ({ data: [], next_token: null });
    const scorePage = async () => ({ data: rows, next_token: null });
    const dependencies = {
        loadToken: () => CURRENT_OURA_TOKEN,
        assertOwnerBinding: () => { },
        refreshAccessToken: async () => {
            throw new Error("the service test token is current");
        },
        fetchDailyReadiness: scorePage,
        fetchDailySleep: scorePage,
        fetchDailyActivity: emptyPage,
        fetchSleep: emptyPage,
        fetchHeartRate: emptyPage,
    };
    return (0, oura_taskmap_context_js_1.fetchOuraTaskMapContext)(options, dependencies);
}
async function repeatedPatternLiveOuraContext(options) {
    const targetDays = new Set([
        "2026-07-23",
        "2026-07-25",
        "2026-07-28",
    ]);
    const rows = Array.from({ length: 15 }, (_, index) => {
        const day = `2026-07-${String(14 + index).padStart(2, "0")}`;
        return {
            day,
            score: targetDays.has(day) ? 60 : 80,
        };
    });
    const emptyPage = async () => ({ data: [], next_token: null });
    const scorePage = async () => ({ data: rows, next_token: null });
    return (0, oura_taskmap_context_js_1.fetchOuraTaskMapContext)(options, {
        loadToken: () => CURRENT_OURA_TOKEN,
        assertOwnerBinding: () => { },
        refreshAccessToken: async () => {
            throw new Error("the service test token is current");
        },
        fetchDailyReadiness: scorePage,
        fetchDailySleep: scorePage,
        fetchDailyActivity: emptyPage,
        fetchSleep: emptyPage,
        fetchHeartRate: emptyPage,
    });
}
async function oneDayBodyInformedLiveOuraContext(options) {
    const rows = Array.from({ length: 28 }, (_, index) => {
        const day = `2026-07-${String(index + 1).padStart(2, "0")}`;
        return {
            day,
            score: day === "2026-07-15" ? 60 : 80,
        };
    });
    const emptyPage = async () => ({ data: [], next_token: null });
    const scorePage = async () => ({ data: rows, next_token: null });
    return (0, oura_taskmap_context_js_1.fetchOuraTaskMapContext)(options, {
        loadToken: () => CURRENT_OURA_TOKEN,
        assertOwnerBinding: () => { },
        refreshAccessToken: async () => {
            throw new Error("the service test token is current");
        },
        fetchDailyReadiness: scorePage,
        fetchDailySleep: scorePage,
        fetchDailyActivity: emptyPage,
        fetchSleep: emptyPage,
        fetchHeartRate: emptyPage,
    });
}
(0, node_test_1.afterEach)(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => {
        server.close(() => resolve());
    })));
});
function canonicalize(value) {
    if (Array.isArray(value))
        return value.map(canonicalize);
    if (value === null || typeof value !== "object")
        return value;
    const input = value;
    return Object.fromEntries(Object.keys(input)
        .sort()
        .filter((key) => input[key] !== undefined)
        .map((key) => [key, canonicalize(input[key])]));
}
function digest(value) {
    return (0, node_crypto_1.createHash)("sha256")
        .update(JSON.stringify(canonicalize(value)))
        .digest("hex");
}
function legacyLocaleCanonicalJson(value) {
    if (Array.isArray(value)) {
        return `[${value.map(legacyLocaleCanonicalJson).join(",")}]`;
    }
    if (value && typeof value === "object") {
        const entries = Object.entries(value)
            .filter(([, item]) => item !== undefined)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => `${JSON.stringify(key)}:${legacyLocaleCanonicalJson(item)}`);
        return `{${entries.join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}
function meetingProducerBinding() {
    return {
        connectionId: "gemini-owner",
        sourceKind: "gemini_meet",
        tenantOrWorkspaceDigest: digest("gemini-workspace"),
        accountOrPrincipalDigest: digest("gemini-principal"),
        grantVersion: "grant-1",
    };
}
function meetingProducerMeeting(documentId, occurredAt, coverage = "partial") {
    return {
        binding: meetingProducerBinding(),
        documentId,
        revisionId: `revision-${documentId}`,
        contentDigest: digest(`content-${documentId}`),
        modifiedAt: occurredAt,
        eventTime: occurredAt,
        observedAt: occurredAt,
        evidence: [{
                kind: "action_item",
                title: "Ship the native semantic refresh",
                summary: "Complete the bounded default Task Map builder.",
                occurredAt,
                observedAt: occurredAt,
                status: "open",
                quality: "structured_generated",
                coverage,
                confidence: 0.9,
                objectRefs: [{
                        kind: "external_reference",
                        referenceDigest: digest("native-semantic-refresh"),
                    }],
            }],
    };
}
function writeMeetingProducerSnapshot(filePath, { userId = "owner-service-test", producedAt = "2026-07-29T12:00:00.000Z", meetings = [
    meetingProducerMeeting("document-a", "2026-07-27T09:00:00.000Z"),
    meetingProducerMeeting("document-b", "2026-07-28T09:00:00.000Z"),
], } = {}) {
    const snapshot = (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)({
        ownerScopeDigest: (0, confirmed_owner_js_1.confirmedTestOwner)(userId).ownerScopeDigest,
        producerVersion: meeting_producer_freshness_js_1.TASKMAP_MEETING_PRODUCER_VERSION,
        producedAt,
        meetings,
    });
    (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(filePath), { recursive: true, mode: 0o700 });
    (0, node_fs_1.writeFileSync)(filePath, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
}
function loaderCompatibleProjection() {
    const fixturePath = node_path_1.default.resolve(process.cwd(), "../DaobrewSentinelMac/Sources/SentinelMac/Resources/TaskMap/taskmap-demo-v1.json");
    const projection = JSON.parse((0, node_fs_1.readFileSync)(fixturePath, "utf8"));
    assert.ok(projection.brain);
    projection.brain.outputDigest = "0".repeat(64);
    return projection;
}
function projectionWithTaskCount(count, source = loaderCompatibleProjection()) {
    const projection = structuredClone(source);
    while (projection.tasks.length < count) {
        const clone = structuredClone(projection.tasks[0]);
        clone.id =
            `tmt_${(0xf000000000000000n + BigInt(projection.tasks.length))
                .toString(16)}`;
        projection.tasks.push(clone);
        const root = projection.roots.find((item) => item.id === clone.rootId);
        assert.ok(root);
        root.taskIds.push(clone.id);
    }
    if (projection.tasks.length > count) {
        projection.tasks = projection.tasks.slice(0, count);
        const retainedNodeIds = new Set([
            ...projection.roots.map((root) => root.id),
            ...projection.tasks.map((task) => task.id),
        ]);
        projection.roots = projection.roots.map((root) => ({
            ...root,
            taskIds: root.taskIds.filter((taskId) => retainedNodeIds.has(taskId)),
        }));
        projection.edges = projection.edges.filter((edge) => retainedNodeIds.has(edge.from) && retainedNodeIds.has(edge.to));
    }
    return projection;
}
function projectionWithDistinctAddedTask(source, taskId) {
    const projection = projectionWithTaskCount(source.tasks.length + 1, source);
    const added = projection.tasks.at(-1);
    assert.ok(added);
    const generatedTaskId = added.id;
    added.id = taskId;
    const root = projection.roots.find((item) => item.id === added.rootId);
    assert.ok(root);
    root.taskIds = root.taskIds.map((id) => id === generatedTaskId ? taskId : id);
    return projection;
}
function acceptedExternalSingletonProjection(source) {
    const projection = structuredClone(source);
    const membershipByTaskId = new Map(projection.edges.filter((edge) => edge.relation === "advances")
        .map((edge) => [edge.to, edge]));
    projection.runId = `tmrun_${digest({
        domain: "taskmap-test-accepted-external-singletons.1",
        predecessorRunId: source.runId,
    }).slice(0, 16)}`;
    projection.inputDigest = digest({
        domain: "taskmap-test-accepted-external-singletons-input.1",
        predecessorInputDigest: source.inputDigest,
    });
    if (projection.brain !== null) {
        projection.brain.outputDigest = digest({
            domain: "taskmap-test-accepted-external-singletons-output.1",
            predecessorOutputDigest: source.brain?.outputDigest,
        });
    }
    projection.roots = projection.tasks.map((task, index) => {
        const predecessorRoot = source.roots.find((root) => root.id === task.rootId);
        assert.ok(predecessorRoot);
        const rootId = `tmr_${digest({ taskId: task.id, index }).slice(0, 16)}`;
        task.rootId = rootId;
        return {
            ...structuredClone(predecessorRoot),
            id: rootId,
            title: `Legacy accepted workstream ${index + 1}`,
            summary: task.summary,
            taskIds: [task.id],
            memberObjectRefs: [`external:${task.id}`],
            citations: structuredClone(task.citations),
        };
    });
    projection.edges = [
        ...projection.edges.filter((edge) => edge.relation !== "advances"),
        ...projection.tasks.flatMap((task, index) => {
            const predecessorEdge = membershipByTaskId.get(task.id);
            if (predecessorEdge === undefined)
                return [];
            return [{
                    ...structuredClone(predecessorEdge),
                    id: `tme_${digest({ taskId: task.id, index }).slice(0, 16)}`,
                    from: task.rootId,
                }];
        }),
    ];
    assert.deepEqual((0, harness_js_1.taskMapProjectionArtifactValidationReasons)(projection), []);
    return projection;
}
function rankinglessPublicationCandidate(reviewCount = 0, projection = loaderCompatibleProjection()) {
    return {
        contractVersion: native_refresh_service_js_1.TASKMAP_NATIVE_PUBLICATION_CANDIDATE_VERSION,
        projection,
        currentness: {
            contractVersion: native_refresh_service_js_1.TASKMAP_NATIVE_CURRENTNESS_GATE_VERSION,
            runId: projection.runId,
            inputDigest: projection.inputDigest,
            projectionDigest: (0, source_contracts_js_1.diffTaskMapProjections)(null, projection).currentProjectionDigest,
            taskDispositions: projection.tasks.map((task, index) => ({
                taskId: task.id,
                disposition: index < reviewCount ? "needs_lifecycle_review" : "current",
            })),
        },
    };
}
function rankingCompatibleProjection(sourceProjection) {
    const projection = structuredClone(sourceProjection);
    const convertedSourceIds = new Set();
    for (const source of projection.sources) {
        if (source.sourceKind !== "linear" && source.sourceKind !== "manual") {
            continue;
        }
        source.sourceKind = "gemini_meet";
        convertedSourceIds.add(source.id);
    }
    for (const task of projection.tasks) {
        task.citations = task.citations.map((citation) => convertedSourceIds.has(citation.pointerId)
            ? { ...citation, sourceKind: "gemini_meet" }
            : citation);
    }
    return projection;
}
function publicationCandidate(reviewCount = 0, sourceProjection = loaderCompatibleProjection(), ownerScopeDigest = TEST_OWNER_SCOPE.ownerScopeDigest) {
    const projection = rankingCompatibleProjection(sourceProjection);
    const candidate = rankinglessPublicationCandidate(reviewCount, projection);
    candidate.ranking = (0, task_ranking_publication_js_1.buildTaskMapTaskRankingPublication)({
        projection,
        ownerScopeDigest,
        sourceStatuses: owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES.map((source) => ({
            source,
            disposition: "fresh",
            sliceDigest: digest(`publication-${source}-slice`),
        })),
    });
    return candidate;
}
function rankedPublicationCandidate(projection = loaderCompatibleProjection(), ownerScopeDigest = TEST_OWNER_SCOPE.ownerScopeDigest) {
    const safeProjection = structuredClone(projection);
    const source = safeProjection.sources[0];
    source.sourceKind = "codex_session";
    for (const [index, task] of safeProjection.tasks.entries()) {
        task.citations = [{
                eventId: `owner-event-${index}`,
                pointerId: source.id,
                sourceKind: "codex_session",
                sourceRefHash: digest(`owner-ranking-ref-${index}`),
                occurredAt: "2026-08-02T12:00:00.000Z",
                extractionConfidence: 1,
            }];
    }
    const candidate = rankinglessPublicationCandidate(0, safeProjection);
    candidate.ranking = (0, task_ranking_publication_js_1.buildTaskMapTaskRankingPublication)({
        projection: safeProjection,
        ownerScopeDigest,
        sourceStatuses: owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES.map((source) => ({
            source,
            disposition: source === "agent_session"
                ? "fresh"
                : "unavailable",
            sliceDigest: source === "agent_session"
                ? digest("ranked-agent-slice")
                : null,
        })),
    });
    return candidate;
}
function rankedCurrentWorkPublicationCandidate(projection = loaderCompatibleProjection()) {
    return rankedExecutablePublicationCandidate(projection);
}
function rankedExecutablePublicationCandidate(sourceProjection = loaderCompatibleProjection()) {
    return publicationCandidate(0, sourceProjection);
}
function ownerBoundPublicationInput(candidate, expectedOwnerScopeDigest, label) {
    return {
        graphInputDigest: digest(`${label}:graph`),
        candidateDigest: digest(candidate),
        candidate: candidate,
        requestedAtMs: 2_240,
        promotionReceiptHeadDigest: (0, native_candidate_acceptance_js_1.taskMapNativeCandidateAcceptanceHeadDigest)(null),
        expectedOwnerScopeDigest,
    };
}
function currentWorkPath(projectionPath) {
    return node_path_1.default.join(node_path_1.default.dirname(projectionPath), "taskmap-current-work.v1.json");
}
function readyProofTargetFromCurrentWorkFixture(currentWork) {
    return {
        ...structuredClone(currentWork.nextTaskToProve),
        approvalPackage: {
            contractVersion: "taskmap-local-approval-inspection.v1",
            readyForLocalApproval: true,
            currentWorkApprovalGranted: false,
            currentWorkExecutable: false,
            authorizationScope: "prepare_local_package_only",
            dispatchAuthorized: false,
            sourceWritebackAuthorized: false,
            codexTaskStartAuthorized: false,
            sourceCompletionAuthorized: false,
            outcomeVerificationAuthorized: false,
        },
    };
}
function readyProofTargetsFixture(candidate, taskIds) {
    return (0, ready_frontier_js_1.buildTaskMapReadyProofTargets)({
        projection: candidate.projection,
        currentness: candidate.currentness,
        proofTargets: taskIds.map((taskId) => readyProofTargetFromCurrentWorkFixture(currentWorkForProjection(candidate.projection, taskId))),
    });
}
function expectedCurrentWorkPredecessors(projection, taskId) {
    const tasks = new Map(projection.tasks.map((task) => [task.id, task]));
    const result = [];
    for (const edge of projection.edges) {
        let predecessorId;
        let relation;
        if (edge.relation === "depends_on" && edge.from === taskId) {
            predecessorId = edge.to;
            relation = "depends_on";
        }
        else if (edge.relation === "blocks" && edge.to === taskId) {
            predecessorId = edge.from;
            relation = "blocks";
        }
        if (predecessorId === undefined || relation === undefined)
            continue;
        const task = tasks.get(predecessorId);
        assert.ok(task);
        result.push({
            taskId: task.id,
            relation,
            reviewState: task.reviewState,
            openState: task.openState,
        });
    }
    return result.sort((left, right) => left.taskId.localeCompare(right.taskId)
        || left.relation.localeCompare(right.relation));
}
function currentWorkForProjection(projection, preferredTaskId) {
    const task = projection.tasks.find((candidate) => {
        const homeId = candidate.taskHomePointerId;
        const source = projection.sources.find((row) => row.id === homeId);
        return ((preferredTaskId === undefined || candidate.id === preferredTaskId)
            &&
                candidate.reviewState === "accepted"
            && candidate.openState === "open"
            && candidate.sourceStatus === "open"
            && candidate.authority !== "none"
            && homeId !== undefined
            && candidate.originPointerIds.includes(homeId)
            && source?.authority === candidate.authority
            && source.sourceKind !== "oura"
            && source.sourceKind !== "codex_session"
            && source.sourceKind !== "claude_session"
            && source.capabilities.includes("read_task")
            && typeof source.sourceVersion === "string"
            && source.sourceVersion.length > 0
            && candidate.citations.some((citation) => citation.pointerId === homeId
                && citation.sourceKind === source.sourceKind));
    });
    assert.ok(task);
    const root = projection.roots.find((candidate) => candidate.id === task.rootId
        && candidate.taskIds.includes(task.id));
    assert.ok(root);
    const sourceById = new Map(projection.sources.map((source) => [source.id, source]));
    const contextPointerIds = [...new Set([
            ...task.originPointerIds.filter((pointerId) => sourceById.get(pointerId)?.sourceKind !== "oura"),
            ...task.citations
                .filter((citation) => citation.sourceKind !== "oura")
                .map((citation) => citation.pointerId),
        ])].sort();
    const returnTarget = task.returnRoute.state === "user_destination_required"
        ? { state: task.returnRoute.state }
        : {
            state: task.returnRoute.state,
            pointerId: task.returnRoute.pointerId,
        };
    const core = {
        contractVersion: "taskmap-current-work.v1",
        projection: {
            contractVersion: projection.contractVersion,
            runId: projection.runId,
            inputDigest: projection.inputDigest,
            generatedAt: projection.generatedAt,
            projectionDigest: (0, source_contracts_js_1.diffTaskMapProjections)(null, projection).currentProjectionDigest,
        },
        currentGoal: {
            rootId: root.id,
            title: "Keep the bounded demo goal verbatim across refresh.",
            accepted: true,
        },
        nextTaskToProve: {
            taskId: task.id,
            rootId: root.id,
            outcome: "The exact accepted task remains ready to prove.",
            input: {
                summary: "Use only the source-backed context already in the map.",
                contextPointerIds,
            },
            predecessors: expectedCurrentWorkPredecessors(projection, task.id),
            doneDefinition: [
                "Current Goal survives the refresh.",
                "Prove and export remain bound to the accepted task.",
            ],
            permission: {
                requiresExplicitApproval: true,
                approvalGranted: false,
            },
            returnTarget,
            executable: false,
        },
        privacy: {
            sourceBodiesStored: false,
            localPathsStored: false,
            rawBiometricsStored: false,
        },
    };
    return {
        ...core,
        artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)(core),
    };
}
function successorProjection(predecessor) {
    const projection = structuredClone(predecessor);
    projection.runId = "tmrun_a000000000000001";
    projection.inputDigest = "a".repeat(64);
    projection.generatedAt = "2026-07-29T18:00:00.000Z";
    return projection;
}
function writePublicationPredecessor(projectionPath, currentnessPath, candidate) {
    const directory = node_path_1.default.dirname(projectionPath);
    (0, node_fs_1.mkdirSync)(directory, { recursive: true, mode: 0o700 });
    const currentTaskId = candidate.currentness.taskDispositions.find((row) => row.disposition === "current")?.taskId;
    const currentWork = currentWorkForProjection(candidate.projection, currentTaskId);
    (0, node_fs_1.writeFileSync)(projectionPath, `${JSON.stringify(candidate.projection, null, 2)}\n`, { mode: 0o600 });
    (0, node_fs_1.writeFileSync)(currentnessPath, `${JSON.stringify(candidate.currentness, null, 2)}\n`, { mode: 0o600 });
    (0, node_fs_1.writeFileSync)(currentWorkPath(projectionPath), (0, source_contracts_js_1.taskMapContractCanonicalJson)(currentWork), { mode: 0o600 });
    return currentWork;
}
function writeReferencedPublicationPredecessor(projectionPath, currentnessPath, candidate, label, readyTaskIds) {
    const ranking = candidate.ranking;
    assert.ok(ranking, "owner generation fixtures require the same ranking member as Swift");
    const generationId = digest(candidate);
    const root = node_path_1.default.dirname(projectionPath);
    const generationDirectory = node_path_1.default.join(root, native_refresh_service_js_1.TASKMAP_NATIVE_GENERATIONS_DIRECTORY, generationId);
    (0, node_fs_1.mkdirSync)(generationDirectory, { recursive: true, mode: 0o700 });
    const currentTaskId = candidate.currentness.taskDispositions.find((row) => row.disposition === "current")?.taskId;
    const currentWork = currentWorkForProjection(candidate.projection, currentTaskId);
    const selectedTaskId = currentWork.nextTaskToProve.taskId;
    const readyProofTargets = readyProofTargetsFixture(candidate, readyTaskIds ?? [selectedTaskId]);
    const artifacts = [
        [node_path_1.default.basename(projectionPath), candidate.projection],
        [node_path_1.default.basename(currentnessPath), candidate.currentness],
        ["taskmap-current-work.v1.json", currentWork],
    ];
    for (const [filename, value] of artifacts) {
        (0, node_fs_1.writeFileSync)(node_path_1.default.join(generationDirectory, filename), (0, source_contracts_js_1.taskMapContractCanonicalJson)(value), { mode: 0o600 });
    }
    (0, node_fs_1.writeFileSync)(node_path_1.default.join(generationDirectory, "taskmap-task-ranking.v1.json"), (0, source_contracts_js_1.taskMapContractCanonicalJson)(ranking), { mode: 0o600 });
    (0, node_fs_1.writeFileSync)((0, native_refresh_service_js_1.taskMapNativeReadyProofTargetsPath)(node_path_1.default.join(generationDirectory, node_path_1.default.basename(projectionPath))), (0, source_contracts_js_1.taskMapContractCanonicalJson)(readyProofTargets), { mode: 0o600 });
    const receipt = (filename, value) => ({
        filename,
        sha256: digest(value),
    });
    const manifest = {
        contractVersion: native_refresh_service_js_1.TASKMAP_NATIVE_GENERATION_MANIFEST_VERSION,
        generationId,
        ownerScopeDigest: TEST_OWNER_SCOPE.ownerScopeDigest,
        graphInputDigest: digest(`${label}:graph`),
        candidateDigest: generationId,
        requestedAtMs: 2_240,
        artifacts: {
            projection: receipt(node_path_1.default.basename(projectionPath), candidate.projection),
            currentness: receipt(node_path_1.default.basename(currentnessPath), candidate.currentness),
            currentWork: receipt("taskmap-current-work.v1.json", currentWork),
            ranking: receipt("taskmap-task-ranking.v1.json", ranking),
        },
    };
    (0, node_fs_1.writeFileSync)(node_path_1.default.join(generationDirectory, native_refresh_service_js_1.TASKMAP_NATIVE_GENERATION_MANIFEST_FILENAME), (0, source_contracts_js_1.taskMapContractCanonicalJson)(manifest), { mode: 0o600 });
    (0, node_fs_1.writeFileSync)(node_path_1.default.join(root, native_refresh_service_js_1.TASKMAP_NATIVE_GENERATION_REFERENCE_FILENAME), (0, source_contracts_js_1.taskMapContractCanonicalJson)({
        contractVersion: native_refresh_service_js_1.TASKMAP_NATIVE_GENERATION_REFERENCE_VERSION,
        generationId,
        ownerScopeDigest: TEST_OWNER_SCOPE.ownerScopeDigest,
        manifestDigest: (0, node_crypto_1.createHash)("sha256")
            .update((0, source_contracts_js_1.taskMapContractCanonicalJson)(manifest))
            .digest("hex"),
    }), { mode: 0o600 });
    // Fixed files are compatibility output only. Keep them populated here so
    // each kill regression can also prove the generation reference, not these
    // mirrors, controls visibility.
    writePublicationPredecessor(projectionPath, currentnessPath, candidate);
    (0, node_fs_1.writeFileSync)((0, native_refresh_service_js_1.nativeTaskRankingPath)(projectionPath), (0, source_contracts_js_1.taskMapContractCanonicalJson)(ranking), { mode: 0o600 });
    (0, node_fs_1.writeFileSync)((0, native_refresh_service_js_1.taskMapNativeReadyProofTargetsPath)(projectionPath), (0, source_contracts_js_1.taskMapContractCanonicalJson)(readyProofTargets), { mode: 0o600 });
    return currentWork;
}
function rewriteGenerationManifestWithLegacyLocaleOrder(projectionPath) {
    const referencePath = (0, native_refresh_service_js_1.nativeTaskMapGenerationReferencePath)(projectionPath);
    const reference = JSON.parse((0, node_fs_1.readFileSync)(referencePath, "utf8"));
    const manifestPath = node_path_1.default.join(node_path_1.default.dirname(projectionPath), native_refresh_service_js_1.TASKMAP_NATIVE_GENERATIONS_DIRECTORY, reference.generationId, native_refresh_service_js_1.TASKMAP_NATIVE_GENERATION_MANIFEST_FILENAME);
    const manifest = JSON.parse((0, node_fs_1.readFileSync)(manifestPath, "utf8"));
    const legacyBytes = legacyLocaleCanonicalJson(manifest);
    (0, node_fs_1.writeFileSync)(manifestPath, legacyBytes, { mode: 0o600 });
    reference.manifestDigest = (0, node_crypto_1.createHash)("sha256")
        .update(legacyBytes)
        .digest("hex");
    (0, node_fs_1.writeFileSync)(referencePath, (0, source_contracts_js_1.taskMapContractCanonicalJson)(reference), { mode: 0o600 });
}
function slice(source, revision = `${source}-r1`, identityDigest = `${source}-identity`) {
    return {
        ownerScopeDigest: TEST_OWNER_SCOPE.ownerScopeDigest,
        revision,
        sliceDigest: (0, source_contracts_js_1.taskMapContractDigest)({ source, revision, identityDigest }),
        value: {
            contractVersion: "taskmap-native-safe-source-slice.v1",
            ownerScopeDigest: TEST_OWNER_SCOPE.ownerScopeDigest,
            source,
            recordCount: 1,
            records: [{
                    identityDigest,
                    revision,
                    occurredAtMs: 100,
                }],
            metadata: { sourceCount: 1 },
        },
    };
}
function admittedAgentSessionSlice(summary, seed = "agent-session-admission", ownerScopeDigest = TEST_OWNER_SCOPE.ownerScopeDigest) {
    const agent = slice("agent_session", `${seed}-revision`);
    agent.value.semanticAdmission = task4AgentAdmission([
        task4Work(`${seed}-root`, `/repo/${seed}`, summary, `${seed}-turn`),
    ], ownerScopeDigest);
    agent.sliceDigest = (0, source_contracts_js_1.taskMapContractDigest)(agent.value);
    return agent;
}
function task4AgentObservation(input) {
    if (input.provider === "claude") {
        return {
            provider: "claude",
            rawJsonl: input.turns.flatMap((turn) => [{
                    timestamp: turn.at,
                    type: "user",
                    sessionId: input.root,
                    uuid: turn.id,
                    repository: input.route,
                    message: {
                        role: "user",
                        content: [{ type: "text", text: turn.text }],
                    },
                }, ...(turn.outcome === undefined ? [] : [{
                        timestamp: new Date(Date.parse(turn.at) + 1_000).toISOString(),
                        type: "assistant",
                        sessionId: input.root,
                        repository: input.route,
                        message: {
                            role: "assistant",
                            content: [{ type: "text", text: turn.outcome }],
                        },
                    }])]).map((row) => JSON.stringify(row)).join("\n") + "\n",
        };
    }
    return {
        provider: "codex",
        rawJsonl: [
            {
                timestamp: "2026-07-30T06:59:00.000Z",
                type: "session_meta",
                payload: { id: input.root },
            },
            {
                timestamp: "2026-07-30T06:59:30.000Z",
                type: "turn_context",
                payload: { repository: input.route },
            },
            ...input.turns.flatMap((turn) => [{
                    timestamp: turn.at,
                    type: "response_item",
                    payload: {
                        id: turn.id,
                        type: "message",
                        role: "user",
                        content: [{ type: "input_text", text: turn.text }],
                    },
                }, ...(turn.outcome === undefined ? [] : [{
                        timestamp: new Date(Date.parse(turn.at) + 1_000).toISOString(),
                        type: "response_item",
                        payload: {
                            type: "message",
                            role: "assistant",
                            content: [{ type: "output_text", text: turn.outcome }],
                        },
                    }])]),
        ].map((row) => JSON.stringify(row)).join("\n") + "\n",
    };
}
function task4AgentAdmission(observations, ownerScopeDigest = TEST_OWNER_SCOPE.ownerScopeDigest) {
    return (0, agent_session_semantic_admission_js_1.buildTaskMapAgentSessionSemanticAdmission)((0, agent_session_producer_freshness_js_1.buildTaskMapAgentSessionProducerSnapshot)({
        ownerScopeDigest,
        producedAt: "2026-07-30T08:00:00.000Z",
        observations,
    }));
}
function task4Work(root, route, text, turn = `turn-${root}`, provider = "codex") {
    return task4AgentObservation({
        provider,
        root,
        route,
        turns: [{
                id: turn,
                text,
                at: "2026-07-30T07:00:00.000Z",
            }],
    });
}
function task6AgentProjection(admission, generatedAt, previousProjection) {
    return (0, native_refresh_service_js_1.buildAgentSessionOnlyProjection)(admission, (0, taskmap_agent_session_extraction_fixture_js_1.buildAgentSessionExtractionFixture)(admission, generatedAt), generatedAt, previousProjection);
}
(0, node_test_1.describe)("Task Map agent-session workstream projection", () => {
    (0, node_test_1.it)("collapses workstreams and proposal clusters with stable source-owned identities while suppressing latest noise", () => {
        const generatedAt = "2026-07-30T08:00:00.000Z";
        const sameDirective = task4AgentAdmission([
            task4Work("fork-a", "/repo/moonshot", "Repair approval routing"),
            task4Work("fork-b", "/repo/moonshot", "Repair approval routing"),
            task4Work("fork-c", "/repo/moonshot", "Repair approval routing"),
        ]);
        assert.equal(sameDirective.clusters.length, 1);
        assert.equal(sameDirective.clusters[0].supports.length, 3);
        const collapsed = task6AgentProjection(sameDirective, generatedAt);
        assert.deepEqual([collapsed.roots.length, collapsed.tasks.length, collapsed.edges.length], [1, 1, 1]);
        assert.deepEqual(collapsed.roots[0].memberObjectRefs, [
            `workstream:${sameDirective.clusters[0].workstreamIdentityDigest}`,
        ]);
        const threeDirectives = task6AgentProjection(task4AgentAdmission([
            task4Work("directive-a", "/repo/moonshot", "Repair approval routing"),
            task4Work("directive-b", "/repo/moonshot", "Remove duplicate roots"),
            task4Work("directive-c", "/repo/moonshot", "Hide terminal controls"),
        ]), generatedAt);
        assert.deepEqual([threeDirectives.roots.length, threeDirectives.tasks.length, threeDirectives.edges.length], [1, 3, 3]);
        const workspaceObservations = [
            task4Work("workspace-a", "/repo/moonshot", "Repair approval routing"),
            task4Work("workspace-b", "/repo/other", "Repair approval routing"),
        ];
        const twoWorkspaces = task6AgentProjection(task4AgentAdmission(workspaceObservations), generatedAt);
        assert.deepEqual([twoWorkspaces.roots.length, twoWorkspaces.tasks.length], [2, 2]);
        assert.equal(new Set(twoWorkspaces.roots.map((root) => root.id)).size, 2, "source-owned workstream identities must disambiguate distinct roots");
        const reversedWorkspaces = task6AgentProjection(task4AgentAdmission([...workspaceObservations].reverse()), generatedAt);
        const rootIdentityView = (projection) => projection.roots.map((root) => ({
            id: root.id,
            title: root.title,
            memberObjectRefs: root.memberObjectRefs,
        })).sort((left, right) => left.id.localeCompare(right.id));
        assert.deepEqual(rootIdentityView(reversedWorkspaces), rootIdentityView(twoWorkspaces), "root identity and display titles must be permutation invariant");
        for (const root of twoWorkspaces.roots) {
            const sourceOwnedWorkstreamRef = root.memberObjectRefs[0];
            assert.equal(root.id, `tmr_${(0, node_crypto_1.createHash)("sha256").update(sourceOwnedWorkstreamRef).digest("hex").slice(0, 16)}`, "display title must not participate in source-owned workstream identity");
        }
        const crossProvider = task6AgentProjection(task4AgentAdmission([
            task4Work("codex-root", "/repo/shared", "Repair approval routing"),
            task4Work("claude-root", "/repo/shared", "Repair approval routing", "claude-turn", "claude"),
        ]), generatedAt);
        assert.deepEqual([crossProvider.roots.length, crossProvider.tasks.length], [1, 1]);
        const baseAdmission = task4AgentAdmission([
            task4Work("base", "/repo/stable", "Repair approval routing", "native-shared"),
        ]);
        const duplicateAdmission = task4AgentAdmission([
            task4Work("base", "/repo/stable", "Repair approval routing", "native-shared"),
            task4Work("copy", "/repo/stable", "Repair approval routing", "native-shared"),
        ]);
        const base = task6AgentProjection(baseAdmission, generatedAt);
        const duplicate = task6AgentProjection(duplicateAdmission, generatedAt, base);
        assert.deepEqual([duplicate.roots.length, duplicate.tasks.length, duplicate.edges.length], [1, 1, 1]);
        assert.equal(duplicate.roots[0].id, base.roots[0].id);
        assert.equal(duplicate.tasks[0].id, base.tasks[0].id);
        for (const latest of ["stop", "ok", "1"]) {
            const suppressed = task4AgentAdmission([
                task4AgentObservation({
                    root: `noise-${latest}`,
                    route: "/repo/noise",
                    turns: [
                        { id: `old-${latest}`, text: "Repair approval routing", at: "2026-07-30T07:00:00.000Z" },
                        { id: `latest-${latest}`, text: latest, at: "2026-07-30T07:01:00.000Z" },
                    ],
                }),
            ]);
            assert.deepEqual(suppressed.clusters, []);
        }
    });
    (0, node_test_1.it)("synthesizes a workstream theme from the highest-confidence mention with a digest tie-break", () => {
        const generatedAt = "2026-07-30T08:00:00.000Z";
        const admission = task4AgentAdmission([
            task4Work("naming-a", "/repo/naming", "Prepare the release brief"),
            task4Work("naming-b", "/repo/naming", "Confirm the launch owners"),
        ]);
        const fixture = (0, taskmap_agent_session_extraction_fixture_js_1.buildAgentSessionExtractionFixture)(admission, generatedAt);
        assert.equal(fixture.clusters.length, 2);
        const clusters = fixture.clusters.map((cluster, index) => ({
            ...cluster,
            mentions: cluster.mentions.map((mention) => ({
                ...mention,
                title: index === 0 ? "Higher digest title" : "Winning natural title",
                confidence: 0.8,
                mentionIdentityDigest: index === 0 ? "f".repeat(64) : "0".repeat(64),
            })),
        }));
        const reportPayload = {
            ...fixture,
            clusters,
        };
        const { reportDigest: _oldReportDigest, ...withoutDigest } = reportPayload;
        const extraction = {
            ...withoutDigest,
            reportDigest: (0, source_contracts_js_1.taskMapContractDigest)(withoutDigest),
        };
        const projection = (0, native_refresh_service_js_1.buildAgentSessionOnlyProjection)(admission, extraction, generatedAt);
        assert.equal(projection.roots[0]?.title, "Workstream: Winning natural title");
        assert.equal(projection.tasks.some((task) => task.title === projection.roots[0]?.title), false);
        assert.equal(JSON.stringify(projection).includes("Agent workstream"), false);
        assert.equal(projection.brain?.model, "fixture-model");
        assert.equal(projection.brain?.provider, "claude-cli");
    });
    (0, node_test_1.it)("emits one task pointer per session episode when one episode supports many mentions", () => {
        const generatedAt = "2026-07-30T08:00:00.000Z";
        const admission = task4AgentAdmission([
            task4Work("shared-episode", "/repo/shared", "Repair approval routing"),
        ]);
        // One observation collapses to a single cluster backed by a single episode.
        assert.equal(admission.clusters.length, 1);
        assert.equal(admission.clusters[0].supports.length, 1);
        const fixture = (0, taskmap_agent_session_extraction_fixture_js_1.buildAgentSessionExtractionFixture)(admission, generatedAt);
        const clusters = fixture.clusters.map((cluster) => ({
            ...cluster,
            mentions: ["First mention title", "Second mention title"].map((title, index) => ({
                ...cluster.mentions[0],
                text: title,
                title,
                mentionIdentityDigest: (0, source_contracts_js_1.taskMapContractDigest)({
                    fixture: "shared-episode-mention",
                    index,
                }),
            })),
        }));
        const { reportDigest: _oldReportDigest, ...withoutDigest } = {
            ...fixture,
            clusters,
        };
        const extraction = {
            ...withoutDigest,
            reportDigest: (0, source_contracts_js_1.taskMapContractDigest)(withoutDigest),
        };
        assert.equal(extraction.clusters[0].mentions.length, 2);
        const projection = (0, native_refresh_service_js_1.buildAgentSessionOnlyProjection)(admission, extraction, generatedAt);
        // The harness accepted the projection: no duplicate source identity.
        assert.equal(projection.runStatus, "accepted");
        assert.deepEqual(projection.rejections, []);
        // Dedup must not drop mentions: each mention keeps its own task and edge.
        assert.equal(projection.tasks.length, 2);
        assert.equal(projection.edges.length, 2);
        assert.equal(new Set(projection.tasks.map((task) => task.id)).size, 2);
        assert.deepEqual(projection.tasks.map((task) => task.title).sort(), ["First mention title", "Second mention title"]);
        // Exactly one task pointer for the shared episode, plus the root pointer.
        const taskPointerIds = new Set(projection.tasks.flatMap((task) => task.originPointerIds));
        assert.equal(taskPointerIds.size, 1);
        // No two projection sources share an identity, and every task still cites
        // the one shared episode pointer.
        assert.equal(new Set(projection.sources.map((source) => source.id)).size, projection.sources.length);
        for (const task of projection.tasks) {
            assert.deepEqual(task.originPointerIds, [...taskPointerIds]);
            assert.equal(task.reviewState, "proposed");
            assert.equal(task.authority, "none");
        }
        // Every mention still carries its own citation event.
        const citedEventIds = new Set(projection.tasks.flatMap((task) => task.citations.map((citation) => citation.eventId)));
        assert.equal(citedEventIds.size, 2);
    });
    (0, node_test_1.it)("retains only predecessor workstreams whose Station-1 clusters are pending", () => {
        const generatedAt = "2026-07-30T08:00:00.000Z";
        const initialAdmission = task4AgentAdmission([
            task4Work("retained-a", "/repo/retained-a", "Publish extracted W1"),
            task4Work("retained-b", "/repo/retained-b", "Keep pending W2"),
        ]);
        const predecessor = task6AgentProjection(initialAdmission, generatedAt);
        const admission = task4AgentAdmission([
            task4Work("retained-a", "/repo/retained-a", "Publish extracted W1"),
            task4Work("retained-b", "/repo/retained-b", "Keep pending W2"),
            task4Work("retained-c", "/repo/retained-c", "Omit new pending W3"),
        ]);
        const fullExtraction = (0, taskmap_agent_session_extraction_fixture_js_1.buildAgentSessionExtractionFixture)(admission, generatedAt);
        const pendingClusters = fullExtraction.clusters.filter((row) => row.clusterIdentityDigest !== admission.clusters.find((cluster) => cluster.userDirectiveSummary === "Publish extracted W1").clusterIdentityDigest);
        const partialPayload = {
            ...fullExtraction,
            clusters: fullExtraction.clusters.map((row) => pendingClusters.some((pending) => pending.clusterIdentityDigest === row.clusterIdentityDigest)
                ? {
                    ...row,
                    status: "degraded",
                    degradationCode: "no_provider",
                    envelopeDigest: null,
                    envelopeModel: null,
                    envelopeTransport: null,
                    mentions: [],
                }
                : row),
            pendingCount: pendingClusters.length,
        };
        const { reportDigest: _partialDigest, ...partialWithoutDigest } = partialPayload;
        const pendingWorkstreams = new Set(pendingClusters.map((row) => row.workstreamIdentityDigest));
        const partial = (0, native_refresh_service_js_1.buildAgentSessionOnlyProjection)(admission, {
            ...partialWithoutDigest,
            reportDigest: (0, source_contracts_js_1.taskMapContractDigest)(partialWithoutDigest),
        }, "2026-07-30T08:01:00.000Z", predecessor, pendingWorkstreams);
        assert.deepEqual(partial.roots.map((root) => root.title).sort(), [
            "Workstream: Keep pending W2",
            "Workstream: Publish extracted W1",
        ].sort());
        assert.equal(JSON.stringify(partial).includes("Omit new pending W3"), false);
    });
    (0, node_test_1.it)("uses the newest representative outcome as the visible proposal summary without changing directive identity", () => {
        const generatedAt = "2026-07-30T08:00:00.000Z";
        const observations = [
            task4AgentObservation({
                root: "outcome-older",
                route: "/repo/outcome",
                turns: [{
                        id: "outcome-older-turn",
                        text: "Prepare the release plan",
                        outcome: "Drafted an earlier release outline.",
                        at: "2026-07-30T07:00:00.000Z",
                    }],
            }),
            task4AgentObservation({
                root: "outcome-newer",
                route: "/repo/outcome",
                turns: [{
                        id: "outcome-newer-turn",
                        text: "Prepare the release plan",
                        outcome: "Verified the final release gates and owners.",
                        at: "2026-07-30T07:10:00.000Z",
                    }],
            }),
        ];
        const admission = task4AgentAdmission(observations);
        assert.equal(admission.clusters.length, 1);
        assert.equal(admission.clusters[0].assistantOutcomeSummary, "Verified the final release gates and owners.");
        const projection = task6AgentProjection(admission, generatedAt);
        assert.equal(projection.tasks[0].title, "Prepare the release plan");
        assert.equal(projection.tasks[0].summary, "Verified the final release gates and owners.");
        const reversed = task6AgentProjection(task4AgentAdmission([...observations].reverse()), generatedAt);
        assert.deepEqual(reversed.tasks.map(({ id, title, summary }) => ({ id, title, summary })), projection.tasks.map(({ id, title, summary }) => ({ id, title, summary })));
    });
});
function collectors(calls, overrides = {}) {
    return Object.fromEntries(owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES.map((source) => [
        source,
        async () => {
            calls?.set(source, (calls.get(source) ?? 0) + 1);
            const override = overrides[source];
            return override === undefined ? slice(source) : override();
        },
    ]));
}
function nonMeetingCollectors() {
    return {
        agent_session: async () => slice("agent_session"),
        calendar: async () => slice("calendar"),
        body: async () => slice("body"),
    };
}
async function assertMeetingBarrierRaceFailsClosed(scenario) {
    const locations = roots(`taskmap-native-meeting-${scenario}-`);
    const ownerUserId = `synthetic-meeting-${scenario}-owner`;
    const ownerScopeDigest = (0, confirmed_owner_js_1.confirmedTestOwner)(ownerUserId).ownerScopeDigest;
    const meetingSnapshotPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "meeting-producer-snapshot.v1.json");
    const producedAt = "2026-07-30T08:00:00.000Z";
    const baselineAtMs = Date.parse("2026-07-30T08:30:00.000Z");
    let nowMs = baselineAtMs;
    writeMeetingProducerSnapshot(meetingSnapshotPath, {
        userId: ownerUserId,
        producedAt,
        meetings: [meetingProducerMeeting("meeting-before-barrier-race", "2026-07-30T07:30:00.000Z")],
    });
    const baseline = new TaskMapNativeRefreshService({
        ...locations,
        ownerUserId,
        meetingProducerSnapshotPath: meetingSnapshotPath,
        collectors: {
            agent_session: async () => admittedAgentSessionSlice("Keep the accepted Meeting work current", `meeting-${scenario}-baseline-agent`, ownerScopeDigest),
            calendar: async () => slice("calendar"),
            body: async () => slice("body"),
        },
        nowMs: () => nowMs,
    });
    const baselineResult = await baseline.requestRefresh("manual");
    assert.equal(baselineResult.refreshStatus, "published", JSON.stringify(baselineResult));
    const projectionBefore = (0, node_fs_1.readFileSync)(locations.projectionPath);
    const currentnessBefore = (0, node_fs_1.readFileSync)(locations.currentnessPath);
    const stateBefore = artifact(locations.runtimeRoot, "taskmap-refresh-state.v1.json");
    const meetingSuccessBefore = stateBefore.lastSourceSuccessAtMs.meeting_notes;
    assert.equal(meetingSuccessBefore, baselineAtMs);
    nowMs += 5 * 60 * 1_000;
    let hookCalls = 0;
    const racing = new TaskMapNativeRefreshService({
        ...locations,
        ownerUserId,
        meetingProducerSnapshotPath: meetingSnapshotPath,
        collectors: {
            agent_session: async () => admittedAgentSessionSlice("Review the changed owner work before publication", `meeting-${scenario}-changed-agent`, ownerScopeDigest),
            calendar: async () => slice("calendar"),
            body: async () => slice("body"),
        },
        nowMs: () => nowMs,
        afterDefaultContextBarrierForTesting: async () => {
            hookCalls += 1;
            if (scenario === "disappears") {
                (0, node_fs_1.rmSync)(meetingSnapshotPath);
                return;
            }
            writeMeetingProducerSnapshot(meetingSnapshotPath, {
                userId: ownerUserId,
                producedAt,
                meetings: [meetingProducerMeeting("meeting-replaced-after-barrier", "2026-07-30T07:45:00.000Z")],
            });
        },
    });
    const result = await racing.requestRefresh("manual");
    assert.equal(hookCalls, 1);
    assert.equal(result.refreshStatus, "unavailable", JSON.stringify(result));
    assert.equal(result.publicationVerified, false);
    assert.equal(result.publicationBlockReason, "semantic_provider_unavailable");
    assert.equal(result.sourceStatuses.find((status) => status.source === "meeting_notes")?.state, "unavailable");
    assert.deepEqual((0, node_fs_1.readFileSync)(locations.projectionPath), projectionBefore);
    assert.deepEqual((0, node_fs_1.readFileSync)(locations.currentnessPath), currentnessBefore);
    const stateAfter = artifact(locations.runtimeRoot, "taskmap-refresh-state.v1.json");
    assert.equal(stateAfter.lastSourceStatuses.find((status) => status.source === "meeting_notes")?.disposition, "unavailable");
    assert.equal(stateAfter.lastSourceSuccessAtMs
        .meeting_notes, meetingSuccessBefore);
}
function graphBuilder(candidate = publicationCandidate()) {
    return async () => ({
        candidateDigest: digest(candidate),
        candidate: candidate,
    });
}
function artifact(runtimeRoot, filename) {
    return JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(runtimeRoot, filename), "utf8"));
}
function committedGeneration(projectionPath) {
    const reference = JSON.parse((0, node_fs_1.readFileSync)((0, native_refresh_service_js_1.nativeTaskMapGenerationReferencePath)(projectionPath), "utf8"));
    const directory = node_path_1.default.join(node_path_1.default.dirname(projectionPath), native_refresh_service_js_1.TASKMAP_NATIVE_GENERATIONS_DIRECTORY, reference.generationId);
    const currentWorkArtifactPath = node_path_1.default.join(directory, "taskmap-current-work.v1.json");
    const rankingPath = node_path_1.default.join(directory, "taskmap-task-ranking.v1.json");
    const readyProofTargetsPath = node_path_1.default.join(directory, "taskmap-ready-proof-targets.v1.json");
    return {
        generationId: reference.generationId,
        projection: JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(directory, "taskmap-projection.v1.json"), "utf8")),
        currentness: JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(directory, "taskmap-currentness.v1.json"), "utf8")),
        currentWork: (0, node_fs_1.existsSync)(currentWorkArtifactPath)
            ? JSON.parse((0, node_fs_1.readFileSync)(currentWorkArtifactPath, "utf8"))
            : null,
        ranking: (0, node_fs_1.existsSync)(rankingPath)
            ? JSON.parse((0, node_fs_1.readFileSync)(rankingPath, "utf8"))
            : null,
        readyProofTargets: (0, node_fs_1.existsSync)(readyProofTargetsPath)
            ? JSON.parse((0, node_fs_1.readFileSync)(readyProofTargetsPath, "utf8"))
            : null,
    };
}
function roots(prefix) {
    const root = (0, node_fs_1.realpathSync)((0, node_fs_1.mkdtempSync)(node_path_1.default.join((0, node_os_1.tmpdir)(), prefix)));
    const projectionDirectory = node_path_1.default.join(root, "taskmap");
    return {
        runtimeRoot: node_path_1.default.join(root, "runtime"),
        projectionPath: node_path_1.default.join(projectionDirectory, "taskmap-projection.v1.json"),
        currentnessPath: node_path_1.default.join(projectionDirectory, "taskmap-currentness.v1.json"),
    };
}
function rawGranolaDegradationFixture(prefix, ownerLabel, bodies) {
    const locations = roots(prefix);
    const owner = (0, confirmed_owner_js_1.confirmedTestOwner)(ownerLabel);
    const producerPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "meeting-producer-snapshot.v1.json");
    const rawPath = node_path_1.default.join(owner.sourceRoot, "granola-mcp-snapshot.json");
    const promptPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "mention-extraction-v1.md");
    writeMeetingProducerSnapshot(producerPath, { userId: ownerLabel });
    (0, node_fs_1.mkdirSync)(owner.taskMapRoot, { recursive: true, mode: 0o700 });
    (0, node_fs_1.mkdirSync)(owner.sourceRoot, { recursive: true, mode: 0o700 });
    const rawBytes = JSON.stringify({
        events: [],
        meeting_notes: bodies.map((body, index) => ({
            id: `raw-degradation-note-${index}`,
            source: "granola",
            source_ref: `raw-degradation-note-${index}`,
            title: "Planning",
            created_at: `2026-07-${String(27 + index).padStart(2, "0")}T09:00:00.000Z`,
            occurred_at: `2026-07-${String(27 + index).padStart(2, "0")}T09:00:00.000Z`,
            participants: ["Owner"],
            summary: body,
            body,
            transcript: [],
            topics: [],
        })),
    });
    (0, node_fs_1.writeFileSync)(rawPath, rawBytes, { mode: 0o600 });
    const granolaSuccessAt = "2026-07-29T12:59:00.000Z";
    (0, node_fs_1.utimesSync)(rawPath, new Date(granolaSuccessAt), new Date(granolaSuccessAt));
    (0, node_fs_1.writeFileSync)(node_path_1.default.join(owner.sourceRoot, "taskmap-resident-receipt.v1.json"), JSON.stringify({
        contractVersion: "taskmap-resident-receipt.v1",
        ownerScopeDigest: owner.ownerScopeDigest,
        granola_mcp_success: granolaSuccessAt,
        granola_mcp_snapshot_sha256: (0, node_crypto_1.createHash)("sha256")
            .update(rawBytes)
            .digest("hex"),
    }), { mode: 0o600 });
    (0, node_fs_1.writeFileSync)(promptPath, "Return strict JSON only.\n", { mode: 0o600 });
    return { ...locations, owner, producerPath, rawPath, promptPath };
}
async function killPublicationChild(locations, journalPath, markerPath, killStage, publication) {
    const childInput = Buffer.from(JSON.stringify({
        ...locations,
        journalPath,
        markerPath,
        killStage,
        publication,
    })).toString("base64url");
    const child = (0, node_child_process_1.spawn)(process.execPath, [
        node_path_1.default.join(__dirname, "support", "taskmap-publication-kill-child.js"),
        childInput,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    const childClosed = new Promise((resolve) => {
        child.once("close", () => resolve());
    });
    let childStderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { childStderr += chunk; });
    const deadline = Date.now() + 5_000;
    while (!(0, node_fs_1.existsSync)(markerPath) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal((0, node_fs_1.existsSync)(markerPath), true, `child did not reach ${killStage} crash boundary: ${childStderr}`);
    child.kill("SIGKILL");
    await childClosed;
}
async function strategyFallbackFixture(prefix, { currentStrategyCount = 1, reviewStrategyCount = 0, currentOtherCount = 0, reviewOtherCount = 0, legacyStrategyEventCount = 0, bodyPatternReady = false, bodyInformedReady = false, } = {}) {
    const root = (0, node_fs_1.realpathSync)((0, node_fs_1.mkdtempSync)(node_path_1.default.join((0, node_os_1.tmpdir)(), prefix)));
    const homeDirectory = node_path_1.default.join(root, "home");
    const taskMapDirectory = node_path_1.default.join(homeDirectory, "Library", "Application Support", "DaoBrew", "taskmap");
    const locations = {
        runtimeRoot: node_path_1.default.join(root, "runtime"),
        projectionPath: node_path_1.default.join(taskMapDirectory, "taskmap-projection.v1.json"),
        currentnessPath: node_path_1.default.join(taskMapDirectory, "taskmap-currentness.v1.json"),
    };
    const remote = "https://github.com/Example/FounderStrategy";
    const revision = "a".repeat(40);
    const repositoryRelativePath = "tasks/TASKS.md";
    const totalStrategyCount = currentStrategyCount + reviewStrategyCount;
    const strategyPointerIds = Array.from({ length: totalStrategyCount }, (_, index) => `strategy-task-${index + 1}`);
    const totalOtherCount = currentOtherCount + reviewOtherCount;
    const otherPointerIds = Array.from({ length: totalOtherCount }, (_, index) => `manual-task-${index + 1}`);
    const pointerIds = [...strategyPointerIds, ...otherPointerIds];
    const rowTexts = Array.from({ length: currentStrategyCount }, (_, index) => `| P${index} | Ship current Task Map task ${index + 1} | Ready |`);
    const repositoryText = [
        "# Tasks",
        "| Priority | Goal | State |",
        "| --- | --- | --- |",
        ...rowTexts,
    ].join("\n");
    const strategyPointers = strategyPointerIds.map((pointerId, index) => ({
        id: pointerId,
        sourceKind: "strategy",
        sourceObjectId: `strategy-source-${index + 1}`,
        sourceRefHash: (0, source_contracts_js_1.taskMapContractDigest)(`strategy:${pointerId}`),
        canonicalUrl: `${remote}/blob/${revision}/${repositoryRelativePath}`,
        sourceVersion: revision,
        authority: "source_system",
        syncMode: "return_only",
        capabilities: ["read_task", "deep_link"],
    }));
    const otherPointers = otherPointerIds.map((pointerId) => ({
        id: pointerId,
        sourceKind: "manual",
        sourceObjectId: pointerId,
        sourceRefHash: (0, source_contracts_js_1.taskMapContractDigest)(`manual:${pointerId}`),
        sourceVersion: "manual.1",
        authority: "user",
        syncMode: "personal_fork",
        capabilities: ["read_task"],
    }));
    const bodyWorkPointers = bodyPatternReady
        ? [
            {
                id: "body-work-agent",
                sourceKind: "codex_session",
                sourceObjectId: "body-work-agent",
                sourceRefHash: (0, source_contracts_js_1.taskMapContractDigest)("body-work-agent"),
                sourceVersion: "agent-work.1",
                authority: "none",
                syncMode: "reference_only",
                capabilities: ["read_context"],
            },
            {
                id: "body-work-meeting",
                sourceKind: "gemini_meet",
                sourceObjectId: "body-work-meeting",
                sourceRefHash: (0, source_contracts_js_1.taskMapContractDigest)("body-work-meeting"),
                sourceVersion: "meeting-work.1",
                authority: "none",
                syncMode: "reference_only",
                capabilities: ["read_context"],
            },
        ]
        : bodyInformedReady
            ? [{
                    id: "body-work-meeting",
                    sourceKind: "granola",
                    sourceObjectId: "body-work-meeting",
                    sourceRefHash: (0, source_contracts_js_1.taskMapContractDigest)("body-work-meeting"),
                    sourceVersion: "meeting-work.1",
                    authority: "none",
                    syncMode: "reference_only",
                    capabilities: ["read_context"],
                }]
            : [];
    const pointers = [
        ...strategyPointers,
        ...otherPointers,
        ...bodyWorkPointers,
    ];
    const authoritativeEvents = pointerIds.map((pointerId, index) => ({
        id: `event-${pointerId}`,
        pointerId,
        recordKind: "authoritative_task",
        activity: strategyPointerIds.includes(pointerId)
            ? "task_updated"
            : "task_created",
        occurredAt: `2026-07-${String(20 + (index % 9)).padStart(2, "0")}T17:00:00.000Z`,
        observedAt: "2026-07-29T18:00:00.000Z",
        objectRefs: ["workstream:moonshot"],
        title: `Ship Task Map task ${index + 1}`,
        summary: `Keep accepted Task Map task ${index + 1} intact.`,
        extractionConfidence: 1,
        sourceStatus: "open",
    }));
    const legacyEvents = strategyPointerIds
        .slice(0, legacyStrategyEventCount)
        .map((pointerId, index) => ({
        id: `legacy-context-${index + 1}`,
        pointerId,
        recordKind: "work_context",
        activity: "context_observed",
        occurredAt: `2026-07-${String(10 + index).padStart(2, "0")}T17:00:00.000Z`,
        observedAt: "2026-07-29T18:00:00.000Z",
        objectRefs: ["workstream:moonshot"],
        title: `Retained context ${index + 1}`,
        summary: `Historical context ${index + 1} remains replay-only.`,
        extractionConfidence: 1,
    }));
    const bodyWorkDates = bodyInformedReady
        ? ["2026-07-15"]
        : [
            "2026-07-23",
            "2026-07-25",
            "2026-07-28",
        ];
    const bodyCoverageDates = [
        "2026-07-21",
        "2026-07-22",
        "2026-07-23",
        "2026-07-24",
        "2026-07-25",
        "2026-07-26",
        "2026-07-27",
        "2026-07-28",
    ];
    const bodyWorkEvents = bodyPatternReady || bodyInformedReady
        ? bodyWorkDates.flatMap((dayKey) => bodyWorkPointers.map((pointer) => ({
            id: `work-${pointer.id}-${dayKey}`,
            pointerId: pointer.id,
            recordKind: "work_context",
            activity: "context_observed",
            occurredAt: `${dayKey}T17:00:00.000Z`,
            observedAt: "2026-07-29T18:00:00.000Z",
            ...(bodyPatternReady ? { dayKey } : {}),
            objectRefs: ["workstream:moonshot"],
            title: "Observed work on Moonshot",
            summary: "An independently observed work occurrence.",
            extractionConfidence: 1,
            ...(bodyPatternReady ? { bodyJoinEligible: true } : {}),
        })))
        : [];
    const bodyCoverageEvents = bodyPatternReady
        ? bodyCoverageDates.flatMap((dayKey) => bodyWorkPointers.map((pointer) => ({
            id: `coverage-${pointer.id}-${dayKey}`,
            pointerId: pointer.id,
            recordKind: "receipt",
            activity: "receipt_observed",
            occurredAt: `${dayKey}T23:00:00.000Z`,
            observedAt: "2026-07-29T18:00:00.000Z",
            dayKey,
            objectRefs: [`coverage:${pointer.id}:${dayKey}`],
            title: "Complete source-day coverage",
            summary: "The source confirmed complete coverage for this day.",
            extractionConfidence: 1,
            corpusCoverage: "complete",
        })))
        : [];
    const events = [
        ...authoritativeEvents,
        ...legacyEvents,
        ...bodyWorkEvents,
        ...bodyCoverageEvents,
    ];
    const input = {
        contractVersion: "taskmap.v1",
        generatedAt: "2026-07-29T18:00:00.000Z",
        pointers,
        events,
    };
    const brain = {
        contractVersion: "taskmap.v1",
        provider: "codex",
        model: "strategy-fallback-fixture",
        promptHash: (0, source_contracts_js_1.taskMapContractDigest)("strategy-fallback-fixture"),
        inputDigest: (0, harness_js_1.taskMapSemanticInputDigest)(input),
        generatedAt: input.generatedAt,
        roots: [{
                proposalId: "root-moonshot",
                title: "Moonshot daily use",
                summary: "The accepted local product workstream.",
                evidenceEventIds: [
                    ...authoritativeEvents,
                    ...legacyEvents,
                    ...bodyWorkEvents,
                ].map((event) => event.id),
                memberObjectRefs: ["workstream:moonshot"],
                confidence: 1,
            }],
        tasks: authoritativeEvents.map((event, index) => ({
            proposalId: `task-moonshot-${index + 1}`,
            rootProposalId: "root-moonshot",
            title: event.title,
            summary: `Accepted projection summary ${index + 1}.`,
            evidenceEventIds: [event.id],
            authoritativeTaskEventId: event.id,
            openState: "open",
            confidence: 1,
        })),
        edges: authoritativeEvents.map((event, index) => ({
            proposalId: `edge-moonshot-${index + 1}`,
            fromProposalId: "root-moonshot",
            toProposalId: `task-moonshot-${index + 1}`,
            relation: "advances",
            evidenceEventIds: [event.id],
            confidence: 1,
        })),
    };
    const projection = (0, harness_js_1.buildTaskMapProjection)(input, brain, {
        arm: "E4",
        now: input.generatedAt,
    });
    assert.equal(projection.runStatus, "accepted");
    const currentPointerIds = new Set([
        ...strategyPointerIds.slice(0, currentStrategyCount),
        ...otherPointerIds.slice(0, currentOtherCount),
    ]);
    const currentness = {
        contractVersion: native_refresh_service_js_1.TASKMAP_NATIVE_CURRENTNESS_GATE_VERSION,
        runId: projection.runId,
        inputDigest: projection.inputDigest,
        projectionDigest: (0, source_contracts_js_1.diffTaskMapProjections)(null, projection).currentProjectionDigest,
        taskDispositions: projection.tasks.map((task) => ({
            taskId: task.id,
            disposition: task.taskHomePointerId !== undefined
                && currentPointerIds.has(task.taskHomePointerId)
                ? "current"
                : "needs_lifecycle_review",
        })).sort((left, right) => left.taskId.localeCompare(right.taskId)),
    };
    const candidate = {
        contractVersion: native_refresh_service_js_1.TASKMAP_NATIVE_PUBLICATION_CANDIDATE_VERSION,
        projection,
        currentness,
        // Retired Strategy sources cannot mint real four-family ranking authority.
        // A present-but-invalid member keeps this fixture explicitly negative while
        // preserving the owner-generation manifest's required member shape.
        ranking: {},
    };
    writeReferencedPublicationPredecessor(locations.projectionPath, locations.currentnessPath, candidate, `${prefix}-strategy-predecessor`);
    (0, node_fs_1.chmodSync)(taskMapDirectory, 0o700);
    const projectionBytes = (0, node_fs_1.readFileSync)(locations.projectionPath);
    const currentnessBytes = (0, node_fs_1.readFileSync)(locations.currentnessPath);
    const evidence = (0, native_predecessor_evidence_js_1.buildTaskMapNativePredecessorEvidence)({
        taskMapInput: input,
        semanticBrainOutput: brain,
        replay: {
            previousProjection: null,
            causalInputs: [],
        },
        projection,
        currentness,
        projectionFileBytes: projectionBytes,
        currentnessFileBytes: currentnessBytes,
    });
    await (0, native_predecessor_evidence_js_1.writeTaskMapNativePredecessorEvidence)({
        homeDirectory,
        evidence,
    });
    const rowBindings = strategyPointerIds
        .slice(0, currentStrategyCount)
        .map((pointerId, index) => ({
        pointerId,
        canonicalRowDigest: (0, exact_provenance_companion_js_1.taskMapCanonicalRepositoryRowDigest)({
            repositoryRelativePath,
            sourceObjectId: pointerId,
            rowText: rowTexts[index],
        }),
    }));
    const readAdapterInput = async () => ({
        ownerScopeDigest: (0, source_contracts_js_1.taskMapContractDigest)("strategy-owner"),
        binding: {
            connectionId: "strategy-owner-read",
            sourceKind: "strategy",
            tenantOrWorkspaceDigest: (0, source_contracts_js_1.taskMapContractDigest)("strategy-workspace"),
            accountOrPrincipalDigest: (0, source_contracts_js_1.taskMapContractDigest)("strategy-owner"),
            grantVersion: "strategy-read-v1",
        },
        projectionBytes,
        currentnessBytes,
        expectedProjectionFileDigest: (0, node_crypto_1.createHash)("sha256").update(projectionBytes).digest("hex"),
        expectedCurrentnessFileDigest: (0, node_crypto_1.createHash)("sha256").update(currentnessBytes).digest("hex"),
        rowBindings,
        repositoryProvider: {
            async readImmutableRepositoryFile() {
                return {
                    remoteLocator: remote,
                    revision,
                    repositoryRelativePath,
                    committedAt: "2026-07-29T17:00:00.000Z",
                    content: repositoryText,
                    contentDigest: (0, node_crypto_1.createHash)("sha256").update(repositoryText).digest("hex"),
                };
            },
        },
    });
    return {
        locations,
        homeDirectory,
        readAdapterInput,
    };
}
(0, node_test_1.describe)("TaskMapNativeRefreshService", () => {
    (0, node_test_1.it)("allows safe partial Agent recovery but blocks one wholly unresolved singleton", () => {
        const allEight = new Set(Array.from({ length: 8 }, (_, index) => `accepted-agent-${index}`));
        assert.equal((0, native_refresh_service_js_1.acceptedAgentMigrationResultUnavailable)(allEight, new Set(["accepted-agent-6", "accepted-agent-7"]), allEight), false, "six proven migrations may publish while two unproven tasks stay unchanged");
        assert.equal((0, native_refresh_service_js_1.acceptedAgentMigrationResultUnavailable)(new Set(["accepted-agent-only"]), new Set(["accepted-agent-only"]), new Set(["accepted-agent-only"]), true), true, "one unresolved Agent singleton must not publish as semantic success");
        assert.equal((0, native_refresh_service_js_1.acceptedAgentMigrationResultUnavailable)(new Set(["accepted-agent-only"]), new Set(["accepted-agent-only"]), new Set(["accepted-agent-only"]), false), false, "a legacy personal fork is not a failed migration without a multi-member semantic plan");
        assert.equal((0, native_refresh_service_js_1.acceptedAgentMigrationResultUnavailable)(new Set(["accepted-agent-a", "accepted-agent-b"]), new Set(["accepted-agent-a", "accepted-agent-b"]), new Set(["accepted-agent-a", "accepted-agent-b"]), false), true, "multiple unresolved receipt-backed singletons must fail closed when the semantic layer is unavailable");
    });
    (0, node_test_1.it)("rejects all historical authority when the verified generation bound is exceeded", () => {
        const exactBound = Array.from({ length: 128 }, (_, index) => index.toString(16).padStart(64, "0")).reverse();
        assert.deepEqual((0, native_refresh_service_js_1.boundedHistoricalGenerationIdsForRecovery)(exactBound), [...exactBound].sort());
        assert.equal((0, native_refresh_service_js_1.boundedHistoricalGenerationIdsForRecovery)([
            ...exactBound,
            "f".repeat(64),
        ]), null, "an unverified suffix must suppress the entire historical proof set");
    });
    (0, node_test_1.it)("replaces only root membership while preserving accepted-task dependency edges", () => {
        const movedTaskIds = new Set(["accepted-task"]);
        assert.equal((0, native_refresh_service_js_1.acceptedAgentTopicMembershipEdgeShouldBeReplaced)({ relation: "advances", to: "accepted-task" }, movedTaskIds), true);
        for (const relation of [
            "depends_on",
            "blocks",
            "supersedes",
            "related_to",
            "body_context_for",
        ]) {
            assert.equal((0, native_refresh_service_js_1.acceptedAgentTopicMembershipEdgeShouldBeReplaced)({ relation, to: "accepted-task" }, movedTaskIds), false, `${relation} must survive topic reparenting`);
        }
    });
    (0, node_test_1.it)("publishes two adopted candidates from one engine workstream as sibling accepted tasks", async () => {
        const locations = roots("taskmap-native-agent-adoption-grouping-");
        const ownerLabel = "task10-agent-adoption-grouping-owner";
        const owner = (0, confirmed_owner_js_1.confirmedTestOwner)(ownerLabel);
        const assessedAt = "2026-07-30T08:01:00.000Z";
        const assessedAtMs = Date.parse(assessedAt);
        const longDirective = "Publish long-title evidence";
        const longExtractedTitle = `Publish ${"long-title ".repeat(12)}evidence`;
        const createExtractionStation = async () => {
            const station = await testMentionExtractionStation();
            return {
                ...station,
                async run(request) {
                    const envelope = await station.run(request);
                    const output = JSON.parse(envelope.outputJson);
                    if (request.promptText.includes(longDirective)) {
                        output.mentions[0].title = longExtractedTitle;
                    }
                    return {
                        ...envelope,
                        outputJson: JSON.stringify(output),
                    };
                },
            };
        };
        const storePath = node_path_1.default.join(owner.taskMapRoot, "native-candidate-acceptance.v1.json");
        (0, node_fs_1.rmSync)(storePath, { force: true });
        const admission = task4AgentAdmission([
            task4Work("task10-group-a", "/repo/task10-grouped-adoption", "Repair proposal review ordering", "task10-group-turn-a"),
            task4Work("task10-group-b", "/repo/task10-grouped-adoption", "Restore community grouping fallback", "task10-group-turn-b"),
            task4Work("task10-group-long", "/repo/task10-grouped-adoption", longDirective, "task10-group-turn-long"),
            task4Work("task10-group-collapse-a", "/repo/task10-grouped-adoption", "Publish release notes", "task10-group-turn-collapse-a"),
            task4Work("task10-group-collapse-b", "/repo/task10-grouped-adoption", "Publish the release notes", "task10-group-turn-collapse-b"),
        ], owner.ownerScopeDigest);
        assert.equal(admission.clusters.length, 5);
        assert.equal(new Set(admission.clusters.map((cluster) => cluster.workstreamIdentityDigest)).size, 1);
        const collectedAgent = slice("agent_session", admission.admissionDigest, admission.clusters[0].clusterIdentityDigest);
        collectedAgent.ownerScopeDigest = owner.ownerScopeDigest;
        collectedAgent.value.ownerScopeDigest = owner.ownerScopeDigest;
        collectedAgent.value.semanticAdmission = admission;
        collectedAgent.sliceDigest = (0, source_contracts_js_1.taskMapContractDigest)(collectedAgent.value);
        const collectors = {
            agent_session: async () => collectedAgent,
            calendar: async () => slice("calendar"),
            body: async () => slice("body"),
        };
        const proposalRefresh = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId: ownerLabel,
            collectors,
            createAgentSessionExtractionStation: createExtractionStation,
            nowMs: () => assessedAtMs,
        });
        assert.equal((await proposalRefresh.requestRefresh("manual")).refreshStatus, "published");
        const proposalGeneration = committedGeneration(locations.projectionPath);
        const proposalTasks = proposalGeneration.projection.tasks.filter((task) => task.reviewState === "proposed");
        assert.ok(proposalTasks.length < admission.clusters.length, "production projection must collapse at least the safely subsumed title pair");
        assert.ok(proposalTasks.some((task) => task.title.endsWith("…")
            && task.title.length < longExtractedTitle.length), "production projection must exercise its bounded long-title path");
        const extraction = await (0, agent_session_refresh_llm_replay_js_1.loadVerifiedTaskMapAgentSessionExtractionReport)({
            admission,
            taskMapRoot: owner.taskMapRoot,
            runtimeRoot: locations.runtimeRoot,
            ownerScopeDigest: owner.ownerScopeDigest,
            promptTemplatePath: node_path_1.default.resolve(__dirname, "../../prompts/agent-session-extraction-v1.md"),
        });
        assert.ok(extraction);
        const candidateReview = (0, agent_session_candidate_adapter_js_1.buildTaskMapAgentSessionCandidateReview)({
            admission,
            extraction,
            previous: null,
            expectedOwnerScopeDigest: owner.ownerScopeDigest,
            assessedAt,
        });
        assert.equal(candidateReview.shelf.candidates.length, 5);
        let acceptanceStore = null;
        for (const candidate of candidateReview.shelf.candidates) {
            const adopted = (0, native_candidate_acceptance_js_1.promoteTaskMapAgentSessionCandidate)({
                admission,
                extraction,
                overlay: candidateReview.overlay,
                previousStore: acceptanceStore,
                expectedOwnerScopeDigest: owner.ownerScopeDigest,
                expectedAcceptanceHeadDigest: (0, native_candidate_acceptance_js_1.taskMapNativeCandidateAcceptanceHeadDigest)(acceptanceStore),
                assessedAt,
                candidateId: candidate.candidateId,
                expectedCandidateRevisionDigest: candidate.candidateRevisionDigest,
                expectedStatementReferenceDigest: candidate.statementReferenceDigest,
                expectedEvidenceProofDigests: candidate.evidenceProofDigests,
                idempotencyKeyDigest: digest(`task10-group-${candidate.candidateId}`),
                confirmedAt: assessedAt,
            });
            acceptanceStore = adopted.store;
            await (0, native_candidate_acceptance_js_1.writeTaskMapNativeCandidateAcceptanceStore)({
                storePath,
                expectedOwnerScopeDigest: owner.ownerScopeDigest,
                store: acceptanceStore,
            });
        }
        assert.ok(acceptanceStore);
        const acceptedRefresh = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId: ownerLabel,
            collectors,
            createAgentSessionExtractionStation: createExtractionStation,
            nowMs: () => assessedAtMs,
        });
        assert.equal((await acceptedRefresh.requestRefresh("manual")).refreshStatus, "published");
        const generation = committedGeneration(locations.projectionPath);
        const acceptedTasks = generation.projection.tasks.filter((task) => task.reviewState === "accepted" && task.authority === "user");
        assert.equal(acceptedTasks.length, 5);
        assert.equal(new Set(acceptedTasks.map((task) => task.rootId)).size, 1, "engine topic membership must survive adoption");
        const acceptedRootId = acceptedTasks[0].rootId;
        assert.equal(generation.projection.tasks.filter((task) => task.rootId === acceptedRootId && task.reviewState === "proposed").length, 0, "adopted leaves must replace their proposed shadows");
        assert.ok(acceptedTasks.some((task) => task.title === "Repair proposal review ordering"));
        assert.ok(acceptedTasks.some((task) => task.title === "Restore community grouping fallback"));
        assert.ok(acceptedTasks.every((task) => task.taskHomePointerId !== undefined
            && task.returnRoute.state === "personal_fork"));
    });
    (0, node_test_1.it)("keeps adopted tasks in their semantic community after the current extraction rotates", async () => {
        const locations = roots("taskmap-native-agent-adoption-history-grouping-");
        const ownerLabel = "task10-agent-adoption-history-grouping-owner";
        const owner = (0, confirmed_owner_js_1.confirmedTestOwner)(ownerLabel);
        const assessedAt = "2026-07-30T08:01:00.000Z";
        const assessedAtMs = Date.parse(assessedAt);
        const firstDirective = "Repair proposal review ordering";
        const secondDirective = "Restore community grouping fallback";
        const thirdDirective = "Preserve dependency graph edges";
        const fourthDirective = "Keep completed tasks ranked last";
        const fifthDirective = "Verify one click identity sequencing";
        const laterDirective = "Verify the grouped adoption release";
        const originalObservations = [
            task4Work("task10-history-group-a", "/repo/task10-history-group-a", firstDirective, "task10-history-group-turn-a"),
            task4Work("task10-history-group-b", "/repo/task10-history-group-b", secondDirective, "task10-history-group-turn-b"),
            task4Work("task10-history-group-d", "/repo/task10-history-group-d", thirdDirective, "task10-history-group-turn-d"),
            task4Work("task10-history-group-e", "/repo/task10-history-group-e", fourthDirective, "task10-history-group-turn-e"),
            task4Work("task10-history-group-f", "/repo/task10-history-group-f", fifthDirective, "task10-history-group-turn-f"),
        ];
        const laterObservations = [
            task4Work("task10-history-group-c", "/repo/task10-history-group-c", laterDirective, "task10-history-group-turn-c"),
        ];
        const createCommunityStation = async () => ({
            provider: {
                transport: "claude-cli",
                executable: "/fixture/provider",
                args: [],
                model: "history-grouping-fixture",
            },
            async run(request) {
                let outputJson;
                if (request.stationId === "community-task-extraction-v1") {
                    const rewrittenMentions = [
                        {
                            source: firstDirective,
                            text: "proposal review ordering",
                            title: "Fix review priority",
                        },
                        {
                            source: secondDirective,
                            text: "community grouping fallback",
                            title: "Preserve semantic communities",
                        },
                        {
                            source: thirdDirective,
                            text: "dependency graph edges",
                            title: "Protect graph relationships",
                        },
                        {
                            source: fourthDirective,
                            text: "completed tasks ranked last",
                            title: "Keep finished work below open work",
                        },
                        {
                            source: fifthDirective,
                            text: "one click identity sequencing",
                            title: "Sequence identity before connection setup",
                        },
                        {
                            source: laterDirective,
                            text: "grouped adoption release",
                            title: "Validate the semantic release",
                        },
                    ];
                    outputJson = JSON.stringify({
                        mentions: rewrittenMentions
                            .filter((mention) => request.promptText.includes(mention.source))
                            .map((mention) => ({
                            text: mention.text,
                            title: mention.title,
                            class: "request",
                            actor: "self",
                            confidence: 0.9,
                        })),
                    });
                }
                else {
                    const payload = JSON.parse(request.promptText.split("\n").at(-1) ?? "{}");
                    outputJson = request.stationId === "community-title-v1"
                        ? JSON.stringify({
                            titles: (payload.communities ?? []).map((community) => ({
                                baseRootProposalId: community.baseRootProposalId,
                                title: "Semantic adoption continuity",
                            })),
                        })
                        : JSON.stringify({
                            groups: [{
                                    nodeIds: (payload.nodes ?? []).map((node) => node.nodeId),
                                }],
                        });
                }
                return {
                    stationId: request.stationId,
                    model: "history-grouping-fixture",
                    promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                    inputDigest: request.inputDigest,
                    outputJson,
                    producedAt: assessedAt,
                    transport: "claude-cli",
                };
            },
        });
        const collectedAgent = (admission) => {
            const agent = slice("agent_session", admission.admissionDigest, admission.clusters[0].clusterIdentityDigest);
            agent.ownerScopeDigest = owner.ownerScopeDigest;
            agent.value.ownerScopeDigest = owner.ownerScopeDigest;
            agent.value.semanticAdmission = admission;
            agent.sliceDigest = (0, source_contracts_js_1.taskMapContractDigest)(agent.value);
            return agent;
        };
        const admission = task4AgentAdmission(originalObservations, owner.ownerScopeDigest);
        const collectors = {
            agent_session: async () => collectedAgent(admission),
            calendar: async () => slice("calendar"),
            body: async () => slice("body"),
        };
        const proposalRefresh = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId: ownerLabel,
            collectors,
            createCommunityGroupingStation: createCommunityStation,
            communityPlanEmbeddingProvider: null,
            agentSessionGraphFeedForTesting: (0, agent_session_semantic_admission_js_1.buildTaskMapAgentSessionGraphFeed)({
                ownerScopeDigest: owner.ownerScopeDigest,
                producedAt: "2026-07-30T08:00:00.000Z",
                observations: originalObservations,
            }),
            nowMs: () => assessedAtMs,
        });
        assert.equal((await proposalRefresh.requestRefresh("manual")).refreshStatus, "published");
        const extraction = await (0, agent_session_refresh_llm_replay_js_1.loadVerifiedTaskMapAgentSessionExtractionReport)({
            admission,
            taskMapRoot: owner.taskMapRoot,
            runtimeRoot: locations.runtimeRoot,
            ownerScopeDigest: owner.ownerScopeDigest,
            promptTemplatePath: node_path_1.default.resolve(__dirname, "../../prompts/agent-session-extraction-v1.md"),
        });
        assert.ok(extraction);
        const candidateReview = (0, agent_session_candidate_adapter_js_1.buildTaskMapAgentSessionCandidateReview)({
            admission,
            extraction,
            previous: null,
            expectedOwnerScopeDigest: owner.ownerScopeDigest,
            assessedAt,
        });
        assert.equal(candidateReview.shelf.candidates.length, 5);
        let acceptanceStore = null;
        const acceptanceStorePath = node_path_1.default.join(owner.taskMapRoot, "native-candidate-acceptance.v1.json");
        (0, node_fs_1.rmSync)(acceptanceStorePath, { force: true });
        for (const candidate of candidateReview.shelf.candidates) {
            const adopted = (0, native_candidate_acceptance_js_1.promoteTaskMapAgentSessionCandidate)({
                admission,
                extraction,
                overlay: candidateReview.overlay,
                previousStore: acceptanceStore,
                expectedOwnerScopeDigest: owner.ownerScopeDigest,
                expectedAcceptanceHeadDigest: (0, native_candidate_acceptance_js_1.taskMapNativeCandidateAcceptanceHeadDigest)(acceptanceStore),
                assessedAt,
                candidateId: candidate.candidateId,
                expectedCandidateRevisionDigest: candidate.candidateRevisionDigest,
                expectedStatementReferenceDigest: candidate.statementReferenceDigest,
                expectedEvidenceProofDigests: candidate.evidenceProofDigests,
                idempotencyKeyDigest: digest(`task10-history-group-${candidate.candidateId}`),
                confirmedAt: assessedAt,
            });
            acceptanceStore = adopted.store;
            await (0, native_candidate_acceptance_js_1.writeTaskMapNativeCandidateAcceptanceStore)({
                storePath: acceptanceStorePath,
                expectedOwnerScopeDigest: owner.ownerScopeDigest,
                store: acceptanceStore,
            });
        }
        assert.ok(acceptanceStore);
        const acceptedRefresh = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId: ownerLabel,
            collectors,
            createCommunityGroupingStation: createCommunityStation,
            communityPlanEmbeddingProvider: null,
            agentSessionGraphFeedForTesting: (0, agent_session_semantic_admission_js_1.buildTaskMapAgentSessionGraphFeed)({
                ownerScopeDigest: owner.ownerScopeDigest,
                producedAt: "2026-07-30T08:00:00.000Z",
                observations: originalObservations,
            }),
            nowMs: () => assessedAtMs,
        });
        assert.equal((await acceptedRefresh.requestRefresh("manual")).refreshStatus, "published");
        const firstAcceptedGeneration = committedGeneration(locations.projectionPath);
        const firstAcceptedTasks = firstAcceptedGeneration.projection.tasks
            .filter((task) => task.reviewState === "accepted" && task.authority === "user");
        const acceptedTaskPayloadById = new Map(firstAcceptedTasks.map((task) => {
            const { rootId: _rootId, ...payload } = structuredClone(task);
            return [task.id, payload];
        }));
        assert.equal(firstAcceptedTasks.length, 5);
        assert.equal(new Set(firstAcceptedTasks.map((task) => task.rootId)).size, 1);
        // Production-shaped pre-proof migration state: durable history retains
        // the exact receipt-bound proofs above, but the selected generation has
        // already collapsed every adopted task into an external singleton and
        // carries no immediate agentSessionTaskProofs.
        const singletonProjection = acceptedExternalSingletonProjection(firstAcceptedGeneration.projection);
        const singletonCurrentness = (0, native_refresh_service_js_1.currentnessForNativeProjection)(singletonProjection, firstAcceptedGeneration.currentness);
        const singletonCandidate = {
            contractVersion: native_refresh_service_js_1.TASKMAP_NATIVE_PUBLICATION_CANDIDATE_VERSION,
            projection: singletonProjection,
            currentness: singletonCurrentness,
            ranking: (0, task_ranking_publication_js_1.buildTaskMapTaskRankingPublication)({
                projection: singletonProjection,
                ownerScopeDigest: owner.ownerScopeDigest,
                sourceStatuses: owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES.map((source) => ({
                    source,
                    disposition: source === "agent_session"
                        ? "fresh"
                        : "unavailable",
                    sliceDigest: source === "agent_session"
                        ? digest("pre-proof-singleton-agent-slice")
                        : null,
                })),
            }),
            agentSessionTaskProofs: [],
        };
        await (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, node_path_1.default.join(locations.runtimeRoot, "pre-proof-singleton-publication-journal.v1.json"), {
            graphInputDigest: digest("pre-proof-singleton-graph"),
            candidateDigest: digest(singletonCandidate),
            candidate: singletonCandidate,
            requestedAtMs: assessedAtMs + 1,
            promotionReceiptHeadDigest: (0, native_candidate_acceptance_js_1.taskMapNativeCandidateAcceptanceHeadDigest)(acceptanceStore),
            expectedOwnerScopeDigest: owner.ownerScopeDigest,
        });
        const singletonGeneration = committedGeneration(locations.projectionPath);
        assert.equal(singletonGeneration.projection.roots.length, 5);
        assert.ok(singletonGeneration.projection.roots.every((root) => root.taskIds.length === 1
            && root.memberObjectRefs.length === 1
            && root.memberObjectRefs[0].startsWith("external:")));
        assert.deepEqual(singletonGeneration.currentWork?.agentSessionTaskProofs, []);
        const laterAdmission = task4AgentAdmission(laterObservations, owner.ownerScopeDigest);
        const rotatedRefresh = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId: ownerLabel,
            collectors: {
                ...collectors,
                agent_session: async () => collectedAgent(laterAdmission),
            },
            createCommunityGroupingStation: createCommunityStation,
            communityPlanEmbeddingProvider: null,
            agentSessionGraphFeedForTesting: (0, agent_session_semantic_admission_js_1.buildTaskMapAgentSessionGraphFeed)({
                ownerScopeDigest: owner.ownerScopeDigest,
                producedAt: "2026-07-30T08:00:00.000Z",
                observations: [...originalObservations, ...laterObservations],
            }),
            nowMs: () => assessedAtMs,
        });
        const rotatedResult = await rotatedRefresh.requestRefresh("manual");
        assert.equal(rotatedResult.refreshStatus, "published", JSON.stringify(rotatedResult));
        assert.equal(rotatedResult.semanticGroupingRetention, null, "a recovered semantic publication must clear predecessor retention truth");
        const rotatedGeneration = committedGeneration(locations.projectionPath);
        const retainedAcceptedTasks = rotatedGeneration.projection.tasks.filter((task) => task.reviewState === "accepted" && task.authority === "user");
        assert.equal(retainedAcceptedTasks.length, 5);
        assert.equal(new Set(retainedAcceptedTasks.map((task) => task.rootId)).size, 1, "accepted tasks must not split back into singleton roots when the latest extraction rotates");
        const retainedRoot = rotatedGeneration.projection.roots.find((root) => root.id === retainedAcceptedTasks[0].rootId);
        assert.ok(retainedRoot);
        assert.equal(retainedRoot.memberObjectRefs.some((ref) => ref.startsWith("community:")), true, "retained accepted membership must remain engine-community-owned");
        const laterTasks = rotatedGeneration.projection.tasks.filter((task) => task.title === laterDirective && task.reviewState === "proposed");
        assert.equal(rotatedGeneration.projection.tasks.filter((task) => task.rootId === retainedAcceptedTasks[0].rootId).length, 5, "accepted work must win the five bounded topic slots");
        assert.equal(laterTasks.length, 0);
        assert.equal(rotatedGeneration.projection.tasks.filter((task) => (task.title === firstDirective || task.title === secondDirective)
            && task.reviewState === "proposed").length, 0, "historical proposed shadows must be replaced by their adopted tasks");
        const rotatedProofs = rotatedGeneration.currentWork
            ?.agentSessionTaskProofs;
        assert.ok(Array.isArray(rotatedProofs));
        assert.equal(rotatedProofs.length, 5, "receipt-bound proofs must survive the first extraction rotation");
        const conflictingProof = structuredClone(rotatedProofs[0]);
        conflictingProof.supportIdentityDigest = digest("conflicting-historical-support");
        assert.equal((0, native_refresh_service_js_1.mergeAcceptedAgentSessionTaskProofHistory)([rotatedProofs[0]], [conflictingProof]).some((proof) => proof.taskId === rotatedProofs[0].taskId), false, "conflicting verified histories must remove all authority for that task");
        const relaunchedRefresh = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId: ownerLabel,
            collectors: {
                ...collectors,
                agent_session: async () => collectedAgent(laterAdmission),
            },
            createCommunityGroupingStation: createCommunityStation,
            communityPlanEmbeddingProvider: null,
            agentSessionGraphFeedForTesting: (0, agent_session_semantic_admission_js_1.buildTaskMapAgentSessionGraphFeed)({
                ownerScopeDigest: owner.ownerScopeDigest,
                producedAt: "2026-07-30T08:00:00.000Z",
                observations: [...originalObservations, ...laterObservations],
            }),
            nowMs: () => assessedAtMs,
        });
        const relaunchedResult = await relaunchedRefresh.requestRefresh("manual");
        assert.equal(relaunchedResult.refreshStatus, "no_op", JSON.stringify(relaunchedResult));
        const relaunchedGeneration = committedGeneration(locations.projectionPath);
        const relaunchedAcceptedTasks = relaunchedGeneration.projection.tasks.filter((task) => task.reviewState === "accepted" && task.authority === "user");
        assert.equal(relaunchedAcceptedTasks.length, 5);
        assert.equal(new Set(relaunchedAcceptedTasks.map((task) => task.rootId)).size, 1, "source-bound grouping must survive a second refresh/relaunch");
        const relaunchedProofs = relaunchedGeneration.currentWork
            ?.agentSessionTaskProofs;
        assert.ok(Array.isArray(relaunchedProofs));
        assert.equal(relaunchedProofs.length, 5, "manual execution proofs must remain available after relaunch");
        const tasklessSingletonProjection = acceptedExternalSingletonProjection(relaunchedGeneration.projection);
        const tasklessSingletonCurrentness = (0, native_refresh_service_js_1.currentnessForNativeProjection)(tasklessSingletonProjection, relaunchedGeneration.currentness);
        const tasklessSingletonCandidate = {
            contractVersion: native_refresh_service_js_1.TASKMAP_NATIVE_PUBLICATION_CANDIDATE_VERSION,
            projection: tasklessSingletonProjection,
            currentness: tasklessSingletonCurrentness,
            ranking: (0, task_ranking_publication_js_1.buildTaskMapTaskRankingPublication)({
                projection: tasklessSingletonProjection,
                ownerScopeDigest: owner.ownerScopeDigest,
                sourceStatuses: owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES.map((source) => ({
                    source,
                    disposition: source === "agent_session"
                        ? "fresh"
                        : "unavailable",
                    sliceDigest: source === "agent_session"
                        ? digest("taskless-singleton-agent-slice")
                        : null,
                })),
            }),
            agentSessionTaskProofs: [],
        };
        await (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, node_path_1.default.join(locations.runtimeRoot, "taskless-singleton-publication-journal.v1.json"), {
            graphInputDigest: digest("taskless-singleton-graph"),
            candidateDigest: digest(tasklessSingletonCandidate),
            candidate: tasklessSingletonCandidate,
            requestedAtMs: assessedAtMs + 2,
            promotionReceiptHeadDigest: (0, native_candidate_acceptance_js_1.taskMapNativeCandidateAcceptanceHeadDigest)(acceptanceStore),
            expectedOwnerScopeDigest: owner.ownerScopeDigest,
        });
        (0, node_fs_1.rmSync)(node_path_1.default.join(owner.taskMapRoot, "llm-envelopes", "mention-extraction-v1", "agent-session"), { recursive: true, force: true });
        (0, node_fs_1.rmSync)(node_path_1.default.join(owner.taskMapRoot, "llm-envelopes", "community-task-extraction-v1"), { recursive: true, force: true });
        const createEmptyAgentExtractionStation = async () => ({
            provider: {
                transport: "claude-cli",
                executable: "/fixture/provider",
                args: [],
                model: "empty-current-extraction-fixture",
            },
            async run(request) {
                return {
                    stationId: request.stationId,
                    model: "empty-current-extraction-fixture",
                    promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                    inputDigest: request.inputDigest,
                    outputJson: JSON.stringify({ mentions: [] }),
                    producedAt: assessedAt,
                    transport: "claude-cli",
                };
            },
        });
        const createTasklessCommunityStation = async () => {
            const station = await createCommunityStation();
            return {
                ...station,
                async run(request) {
                    if (request.stationId !== "community-task-extraction-v1") {
                        return station.run(request);
                    }
                    return {
                        stationId: request.stationId,
                        model: "taskless-community-fixture",
                        promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                        inputDigest: request.inputDigest,
                        outputJson: JSON.stringify({ mentions: [] }),
                        producedAt: assessedAt,
                        transport: "claude-cli",
                    };
                },
            };
        };
        const tasklessRefresh = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId: ownerLabel,
            collectors,
            createAgentSessionExtractionStation: createEmptyAgentExtractionStation,
            createCommunityGroupingStation: createTasklessCommunityStation,
            communityPlanEmbeddingProvider: null,
            agentSessionGraphFeedForTesting: (0, agent_session_semantic_admission_js_1.buildTaskMapAgentSessionGraphFeed)({
                ownerScopeDigest: owner.ownerScopeDigest,
                producedAt: "2026-07-30T08:00:00.000Z",
                observations: originalObservations,
            }),
            nowMs: () => assessedAtMs + 3,
        });
        const tasklessResult = await tasklessRefresh.requestRefresh("manual");
        assert.equal(tasklessResult.refreshStatus, "published", JSON.stringify(tasklessResult));
        const tasklessExtractionReport = artifact(locations.runtimeRoot, "taskmap-agent-session-extraction-report.v1.json");
        assert.ok(tasklessExtractionReport.clusters.length > 0);
        assert.equal(tasklessExtractionReport.pendingCount, tasklessExtractionReport.clusters.length);
        assert.ok(tasklessExtractionReport.clusters.every((cluster) => cluster.status === "degraded"
            && cluster.degradationCode === "invalid_extraction_output"
            && cluster.mentions.length === 0));
        const recoveredFromTaskless = committedGeneration(locations.projectionPath);
        const tasklessAccepted = recoveredFromTaskless.projection.tasks.filter((task) => task.reviewState === "accepted" && task.authority === "user");
        assert.equal(tasklessAccepted.length, 5);
        for (const task of tasklessAccepted) {
            const { rootId: _rootId, ...payload } = structuredClone(task);
            assert.deepEqual(payload, acceptedTaskPayloadById.get(task.id), "topic recovery may change only root membership; accepted citations and return routes are immutable");
        }
        assert.equal(new Set(tasklessAccepted.map((task) => task.rootId)).size, 1, "historical source lineage must recover membership even when every current bounded report leaf is empty");
        assert.ok(recoveredFromTaskless.projection.roots.some((root) => root.id === tasklessAccepted[0].rootId
            && root.memberObjectRefs.some((ref) => ref.startsWith("community:"))));
        assert.equal(recoveredFromTaskless.projection.tasks.filter((task) => task.reviewState === "proposed").length, 0);
        const recoveredTasklessProofs = recoveredFromTaskless.currentWork?.agentSessionTaskProofs;
        assert.equal(recoveredTasklessProofs?.length, 5);
        assert.ok(recoveredFromTaskless.readyProofTargets);
        assert.ok(recoveredFromTaskless.readyProofTargets.proofTargets.some((target) => tasklessAccepted.some((task) => task.id === target.taskId)
            && target.approvalPackage.readyForLocalApproval
            && target.approvalPackage.authorizationScope
                === "prepare_local_package_only"), "a migrated accepted task must remain eligible for a local approval package");
        const unavailableSingletonProjection = acceptedExternalSingletonProjection(recoveredFromTaskless.projection);
        const unavailableSingletonCandidate = {
            contractVersion: native_refresh_service_js_1.TASKMAP_NATIVE_PUBLICATION_CANDIDATE_VERSION,
            projection: unavailableSingletonProjection,
            currentness: (0, native_refresh_service_js_1.currentnessForNativeProjection)(unavailableSingletonProjection, recoveredFromTaskless.currentness),
            ranking: (0, task_ranking_publication_js_1.buildTaskMapTaskRankingPublication)({
                projection: unavailableSingletonProjection,
                ownerScopeDigest: owner.ownerScopeDigest,
                sourceStatuses: owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES.map((source) => ({
                    source,
                    disposition: source === "agent_session"
                        ? "fresh"
                        : "unavailable",
                    sliceDigest: source === "agent_session"
                        ? digest("unavailable-singleton-agent-slice")
                        : null,
                })),
            }),
            agentSessionTaskProofs: [],
        };
        await (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, node_path_1.default.join(locations.runtimeRoot, "unavailable-singleton-publication-journal.v1.json"), {
            graphInputDigest: digest("unavailable-singleton-graph"),
            candidateDigest: digest(unavailableSingletonCandidate),
            candidate: unavailableSingletonCandidate,
            requestedAtMs: assessedAtMs + 4,
            promotionReceiptHeadDigest: (0, native_candidate_acceptance_js_1.taskMapNativeCandidateAcceptanceHeadDigest)(acceptanceStore),
            expectedOwnerScopeDigest: owner.ownerScopeDigest,
        });
        const generationDirectory = node_path_1.default.join(node_path_1.default.dirname(locations.projectionPath), "taskmap-generations");
        for (const entry of (0, node_fs_1.readdirSync)(generationDirectory, {
            withFileTypes: true,
        })) {
            if (!entry.isDirectory())
                continue;
            const currentWorkPath = node_path_1.default.join(generationDirectory, entry.name, "taskmap-current-work.v1.json");
            if (!(0, node_fs_1.existsSync)(currentWorkPath))
                continue;
            const currentWork = JSON.parse((0, node_fs_1.readFileSync)(currentWorkPath, "utf8"));
            if ((currentWork.agentSessionTaskProofs?.length ?? 0) > 0) {
                (0, node_fs_1.rmSync)(node_path_1.default.join(generationDirectory, entry.name), {
                    recursive: true,
                    force: true,
                });
            }
        }
        const retainedProjectionBefore = (0, node_fs_1.readFileSync)(locations.projectionPath);
        const retainedTaskIdsBefore = committedGeneration(locations.projectionPath)
            .projection.tasks.map((task) => task.id).sort();
        const retainedRootIdsBefore = committedGeneration(locations.projectionPath)
            .projection.roots.map((root) => root.id).sort();
        const retainedProjectionDigest = (0, node_crypto_1.createHash)("sha256")
            .update(retainedProjectionBefore)
            .digest("hex");
        assert.deepEqual((0, native_refresh_service_js_1.retainedSemanticGroupingMarker)(unavailableSingletonProjection, retainedProjectionDigest, acceptanceStore, "accepted_membership_migration_unavailable"), {
            state: "retained_predecessor",
            reason: "plan2_unavailable",
            projectionDigest: retainedProjectionDigest,
            acceptedTaskCount: 5,
        }, "the marker predicate must recognize exact receipt-backed singleton retention");
        assert.deepEqual((0, native_refresh_service_js_1.retainedSemanticGroupingMarker)(unavailableSingletonProjection, retainedProjectionDigest, acceptanceStore, "semantic_provider_unavailable"), {
            state: "retained_predecessor",
            reason: "plan2_unavailable",
            projectionDigest: retainedProjectionDigest,
            acceptedTaskCount: 5,
        }, "semantic provider failure must carry the same truthful retained-predecessor marker");
        const legitimateTask = unavailableSingletonProjection.tasks[0];
        const legitimateRoot = unavailableSingletonProjection.roots.find((root) => root.id === legitimateTask.rootId);
        assert.equal((0, native_refresh_service_js_1.retainedSemanticGroupingMarker)({
            ...unavailableSingletonProjection,
            roots: [legitimateRoot],
            tasks: [legitimateTask],
            edges: unavailableSingletonProjection.edges.filter((edge) => edge.from === legitimateTask.id || edge.to === legitimateTask.id),
        }, retainedProjectionDigest, acceptanceStore, "semantic_provider_unavailable"), null, "one legitimate receipt-backed singleton is a valid boundary, not a failed grouping");
        const unavailableResult = await new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId: ownerLabel,
            collectors,
            createAgentSessionExtractionStation: createEmptyAgentExtractionStation,
            createCommunityGroupingStation: createTasklessCommunityStation,
            communityPlanEmbeddingProvider: null,
            agentSessionGraphFeedForTesting: (0, agent_session_semantic_admission_js_1.buildTaskMapAgentSessionGraphFeed)({
                ownerScopeDigest: owner.ownerScopeDigest,
                producedAt: "2026-07-30T08:00:00.000Z",
                observations: originalObservations,
            }),
            nowMs: () => assessedAtMs + 5,
        }).requestRefresh("manual");
        assert.equal(unavailableResult.refreshStatus, "unavailable");
        assert.equal(unavailableResult.publicationBlockReason, "accepted_membership_migration_unavailable");
        assert.deepEqual(unavailableResult.semanticGroupingRetention, {
            state: "retained_predecessor",
            reason: "plan2_unavailable",
            projectionDigest: retainedProjectionDigest,
            acceptedTaskCount: 5,
        }, "an unavailable semantic layer must label the retained multi-singleton predecessor instead of presenting it as current grouping");
        assert.deepEqual((0, node_fs_1.readFileSync)(locations.projectionPath), retainedProjectionBefore, "retention truth must not rewrite the accepted projection");
        assert.deepEqual(committedGeneration(locations.projectionPath).projection.tasks
            .map((task) => task.id).sort(), retainedTaskIdsBefore, "retention truth must not fabricate or mutate accepted task identity");
        assert.deepEqual(committedGeneration(locations.projectionPath).projection.roots
            .map((root) => root.id).sort(), retainedRootIdsBefore, "retention truth must not fabricate or mutate root identity");
        const unavailableStatus = artifact(locations.runtimeRoot, "taskmap-refresh-status.v1.json");
        assert.deepEqual(unavailableStatus.semanticGroupingRetention, unavailableResult.semanticGroupingRetention, "the durable status and reported refresh outcome must agree");
        assert.equal(committedGeneration(locations.projectionPath).generationId, digest(unavailableSingletonCandidate), "unavailable migration must not publish a new singleton success");
    });
    (0, node_test_1.it)("publishes an adopted agent proposal as one receipt-backed current and ready manual task", async () => {
        const locations = roots("taskmap-native-agent-adoption-lifecycle-");
        const ownerLabel = "task10-agent-adoption-owner";
        const owner = (0, confirmed_owner_js_1.confirmedTestOwner)(ownerLabel);
        const assessedAt = "2026-07-30T08:01:00.000Z";
        const assessedAtMs = Date.parse(assessedAt);
        const storePath = node_path_1.default.join(owner.taskMapRoot, "native-candidate-acceptance.v1.json");
        (0, node_fs_1.rmSync)(storePath, { force: true });
        const work = (root, turn) => task4Work(root, "/repo/task10-agent-adoption", "Implement receipt-backed proposal adoption", turn);
        const originalAdmission = task4AgentAdmission([work("task10-agent-a", "task10-agent-turn-a")], owner.ownerScopeDigest);
        let currentAdmission = originalAdmission;
        const agentSlice = () => {
            const collected = slice("agent_session", currentAdmission.admissionDigest, currentAdmission.clusters[0]?.clusterIdentityDigest
                ?? "task10-agent-empty");
            collected.ownerScopeDigest = owner.ownerScopeDigest;
            collected.value.ownerScopeDigest = owner.ownerScopeDigest;
            collected.value.semanticAdmission = currentAdmission;
            collected.sliceDigest = (0, source_contracts_js_1.taskMapContractDigest)(collected.value);
            return collected;
        };
        const sourceCollectors = {
            agent_session: async () => agentSlice(),
            calendar: async () => slice("calendar"),
            body: async () => slice("body"),
        };
        const proposalRefresh = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId: ownerLabel,
            collectors: sourceCollectors,
            nowMs: () => assessedAtMs,
        });
        const proposalResult = await proposalRefresh.requestRefresh("manual");
        assert.equal(proposalResult.refreshStatus, "published");
        const proposalGeneration = committedGeneration(locations.projectionPath);
        assert.equal(proposalGeneration.projection.tasks.length, 1);
        const proposalTask = proposalGeneration.projection.tasks[0];
        assert.equal(proposalTask.reviewState, "proposed");
        assert.equal(proposalTask.authority, "none");
        assert.equal(proposalGeneration.currentness.taskDispositions[0]?.disposition, "needs_lifecycle_review");
        assert.deepEqual(proposalGeneration.ranking?.rankedAcceptedOpen, []);
        assert.deepEqual(proposalGeneration.readyProofTargets?.proofTargets, []);
        const extraction = (0, taskmap_agent_session_extraction_fixture_js_1.buildAgentSessionExtractionFixture)(originalAdmission, assessedAt);
        const candidateProjection = (0, agent_session_candidate_adapter_js_1.buildTaskMapAgentSessionCandidateReview)({
            admission: originalAdmission,
            extraction,
            previous: null,
            expectedOwnerScopeDigest: owner.ownerScopeDigest,
            assessedAt,
        });
        const candidate = candidateProjection.shelf.candidates[0];
        assert.equal(candidate.candidateFamily, "agent_session");
        const adopted = (0, native_candidate_acceptance_js_1.promoteTaskMapAgentSessionCandidate)({
            admission: originalAdmission,
            extraction,
            overlay: candidateProjection.overlay,
            previousStore: null,
            expectedOwnerScopeDigest: owner.ownerScopeDigest,
            expectedAcceptanceHeadDigest: (0, native_candidate_acceptance_js_1.taskMapNativeCandidateAcceptanceHeadDigest)(null),
            assessedAt,
            candidateId: candidate.candidateId,
            expectedCandidateRevisionDigest: candidate.candidateRevisionDigest,
            expectedStatementReferenceDigest: candidate.statementReferenceDigest,
            expectedEvidenceProofDigests: candidate.evidenceProofDigests,
            idempotencyKeyDigest: digest("task10-owner-adoption"),
            confirmedAt: assessedAt,
        });
        await (0, native_candidate_acceptance_js_1.writeTaskMapNativeCandidateAcceptanceStore)({
            storePath,
            expectedOwnerScopeDigest: owner.ownerScopeDigest,
            store: adopted.store,
        });
        const durableStore = JSON.parse((0, node_fs_1.readFileSync)(storePath, "utf8"));
        assert.equal(durableStore.receipts.length, 1);
        assert.equal(durableStore.receipts[0]?.promotionDigest, adopted.receipt.promotionDigest);
        const acceptedRefresh = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId: ownerLabel,
            collectors: sourceCollectors,
            nowMs: () => assessedAtMs,
        });
        const acceptedResult = await acceptedRefresh.requestRefresh("manual");
        assert.equal(acceptedResult.refreshStatus, "published");
        const acceptedGeneration = committedGeneration(locations.projectionPath);
        const acceptedTasks = acceptedGeneration.projection.tasks.filter((task) => task.reviewState === "accepted"
            && task.authority === "user");
        assert.equal(acceptedTasks.length, 1);
        const acceptedTask = acceptedTasks[0];
        assert.equal(acceptedTask.openState, "open");
        assert.equal(acceptedTask.taskHomePointerId, adopted.receipt.promotionId, "accepted identity must be anchored in the durable promotion receipt");
        const acceptedSource = acceptedGeneration.projection.sources.find((source) => source.id === adopted.receipt.promotionId);
        assert.ok(acceptedSource);
        assert.deepEqual([
            acceptedSource.sourceKind,
            acceptedSource.authority,
            acceptedSource.syncMode,
        ], ["manual", "user", "personal_fork"]);
        assert.ok(acceptedTask.originPointerIds.includes(adopted.receipt.promotionId));
        const stillProposed = acceptedGeneration.projection.tasks.filter((task) => task.reviewState === "proposed");
        assert.equal(stillProposed.length, 1);
        assert.equal(stillProposed[0]?.id, proposalTask.id);
        assert.equal(stillProposed[0]?.authority, "none");
        assert.deepEqual(acceptedGeneration.currentness.taskDispositions, [
            {
                taskId: acceptedTask.id,
                disposition: "current",
            },
            {
                taskId: stillProposed[0].id,
                disposition: "needs_lifecycle_review",
            },
        ].sort((left, right) => left.taskId.localeCompare(right.taskId)));
        assert.deepEqual(acceptedGeneration.readyProofTargets?.proofTargets.map((target) => target.taskId), [acceptedTask.id]);
        assert.equal(acceptedGeneration.currentWork?.nextTaskToProve?.taskId, acceptedTask.id);
        currentAdmission = task4AgentAdmission([
            work("task10-agent-a", "task10-agent-turn-a"),
            work("task10-agent-b", "task10-agent-turn-b"),
        ], owner.ownerScopeDigest);
        assert.equal(currentAdmission.clusters.length, 1);
        assert.equal(currentAdmission.clusters[0].supports.length, 2);
        const duplicateSupportRefresh = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId: ownerLabel,
            collectors: sourceCollectors,
            nowMs: () => assessedAtMs,
        });
        assert.equal((await duplicateSupportRefresh.requestRefresh("manual")).refreshStatus, "published");
        const duplicateGeneration = committedGeneration(locations.projectionPath);
        assert.equal(duplicateGeneration.projection.tasks.filter((task) => task.reviewState === "accepted").length, 1);
        assert.equal(JSON.parse((0, node_fs_1.readFileSync)(storePath, "utf8")).receipts.length, 1);
        const referencePath = (0, native_refresh_service_js_1.nativeTaskMapGenerationReferencePath)(locations.projectionPath);
        const referenceBeforeMismatch = (0, node_fs_1.readFileSync)(referencePath);
        const projectionBeforeMismatch = (0, node_fs_1.readFileSync)(locations.projectionPath);
        const currentnessBeforeMismatch = (0, node_fs_1.readFileSync)(locations.currentnessPath);
        const mismatched = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId: ownerLabel,
            collectors: sourceCollectors,
            readCandidateAcceptanceHeadDigest: async () => digest("task10-mismatched-receipt-head"),
            nowMs: () => assessedAtMs,
        });
        const mismatchResult = await mismatched.requestRefresh("manual");
        assert.equal(mismatchResult.refreshStatus, "unavailable");
        assert.deepEqual((0, node_fs_1.readFileSync)(referencePath), referenceBeforeMismatch);
        assert.deepEqual((0, node_fs_1.readFileSync)(locations.projectionPath), projectionBeforeMismatch);
        assert.deepEqual((0, node_fs_1.readFileSync)(locations.currentnessPath), currentnessBeforeMismatch);
    });
    (0, node_test_1.it)("keeps a derived milestone current only while every cited source task remains current", () => {
        const projection = loaderCompatibleProjection();
        const [sourceA, sourceB, derived, meetingOnly] = projection.tasks;
        assert.ok(sourceA);
        assert.ok(sourceB);
        assert.ok(derived);
        assert.ok(meetingOnly);
        Object.assign(sourceA, {
            reviewState: "accepted",
            openState: "open",
            authority: "source_system",
            taskHomePointerId: "pointer-source-a",
            originPointerIds: ["pointer-source-a"],
        });
        Object.assign(sourceB, {
            reviewState: "accepted",
            openState: "open",
            authority: "source_system",
            taskHomePointerId: "pointer-source-b",
            originPointerIds: ["pointer-source-b"],
        });
        Object.assign(derived, {
            reviewState: "proposed",
            openState: "possibly_open",
            authority: "none",
            taskHomePointerId: undefined,
            originPointerIds: ["pointer-source-a", "pointer-source-b"],
        });
        Object.assign(meetingOnly, {
            reviewState: "proposed",
            openState: "possibly_open",
            authority: "none",
            taskHomePointerId: undefined,
            originPointerIds: ["pointer-meeting-only"],
        });
        const predecessor = publicationCandidate(projection.tasks.length, projection).currentness;
        predecessor.taskDispositions = predecessor.taskDispositions.map((row) => ({
            ...row,
            disposition: row.taskId === sourceA.id || row.taskId === sourceB.id
                ? "current"
                : "needs_lifecycle_review",
        }));
        const supported = (0, native_refresh_service_js_1.currentnessForNativeProjection)(projection, predecessor);
        const supportedByTask = new Map(supported.taskDispositions.map((row) => [
            row.taskId,
            row.disposition,
        ]));
        assert.equal(supportedByTask.get(derived.id), "current");
        assert.equal(supportedByTask.get(meetingOnly.id), "needs_lifecycle_review");
        const missingSource = structuredClone(supported);
        missingSource.taskDispositions = missingSource.taskDispositions.map((row) => row.taskId === sourceB.id
            ? { ...row, disposition: "needs_lifecycle_review" }
            : row);
        assert.equal(missingSource.taskDispositions.find((row) => row.taskId === derived.id)?.disposition, "current");
        const unsupported = (0, native_refresh_service_js_1.currentnessForNativeProjection)(projection, missingSource);
        assert.equal(unsupported.taskDispositions.find((row) => row.taskId === derived.id)
            ?.disposition, "needs_lifecycle_review");
    });
    (0, node_test_1.it)("publishes a bounded owner-only agent-session producer artifact and binds its exact result digest as context only", async () => {
        const locations = roots("taskmap-native-agent-producer-");
        const ownerUserId = "synthetic-agent-owner";
        const ownerScopeDigest = (0, confirmed_owner_js_1.confirmedTestOwner)(ownerUserId).ownerScopeDigest;
        const ownerCandidate = publicationCandidate(0, loaderCompatibleProjection(), ownerScopeDigest);
        const sourceRoot = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "agent-sources");
        const codexRoot = node_path_1.default.join(sourceRoot, "codex");
        const claudeRoot = node_path_1.default.join(sourceRoot, "claude");
        (0, node_fs_1.mkdirSync)(codexRoot, { recursive: true, mode: 0o700 });
        (0, node_fs_1.mkdirSync)(claudeRoot, { recursive: true, mode: 0o700 });
        const privatePath = "/Users/private-owner/private-task.md";
        const rawSession = [
            {
                timestamp: "2026-07-30T06:00:00.000Z",
                type: "session_meta",
                payload: {
                    id: "synthetic-session-identity",
                    parent_id: "synthetic-parent-identity",
                },
            },
            {
                timestamp: "2026-07-30T06:01:00.000Z",
                type: "response_item",
                payload: {
                    type: "message",
                    role: "user",
                    content: [{
                            type: "input_text",
                            text: `Build\u0001 the\u0002 demo from ${privatePath}`,
                        }],
                },
            },
            {
                timestamp: "2026-07-30T06:02:00.000Z",
                type: "reasoning",
                payload: { summary: "private reasoning must never persist" },
            },
            {
                timestamp: "2026-07-30T06:03:00.000Z",
                type: "response_item",
                payload: {
                    type: "function_call",
                    role: "assistant",
                    content: [{
                            type: "tool_use",
                            input: { secret: "private-tool-argument" },
                        }],
                },
            },
            {
                timestamp: "2026-07-30T06:04:00.000Z",
                type: "response_item",
                payload: {
                    type: "message",
                    role: "assistant",
                    content: [{
                            type: "output_text",
                            text: "Prepared\u0003 the\u0004 bounded local package.",
                        }],
                },
            },
        ].map((row) => JSON.stringify(row)).join("\n") + "\n";
        const nowMs = Date.parse("2026-07-30T08:00:00.000Z");
        const recentSessionPath = node_path_1.default.join(codexRoot, "session.jsonl");
        (0, node_fs_1.writeFileSync)(recentSessionPath, rawSession, { mode: 0o600 });
        const oldSessionPath = node_path_1.default.join(codexRoot, "old-session.jsonl");
        (0, node_fs_1.writeFileSync)(oldSessionPath, rawSession, { mode: 0o600 });
        const recentTime = new Date(nowMs - agent_session_producer_freshness_js_1.TASKMAP_AGENT_SESSION_CONTEXT_WINDOW_MS);
        const oldTime = new Date(nowMs - agent_session_producer_freshness_js_1.TASKMAP_AGENT_SESSION_CONTEXT_WINDOW_MS - 1_000);
        (0, node_fs_1.utimesSync)(recentSessionPath, recentTime, recentTime);
        (0, node_fs_1.utimesSync)(oldSessionPath, oldTime, oldTime);
        const agentSnapshotPath = node_path_1.default.join(sourceRoot, "agent-session-producer-snapshot.v1.json");
        let graphInput;
        const service = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId,
            sourcePaths: {
                agentSessionRoots: [
                    { sourceLabel: "codex", rootPath: codexRoot },
                    { sourceLabel: "claude", rootPath: claudeRoot },
                ],
                agentSessionProducerSnapshotPath: agentSnapshotPath,
            },
            collectors: {
                meeting_notes: async () => slice("meeting_notes"),
                calendar: async () => slice("calendar"),
                body: async () => slice("body"),
            },
            graphBuilder: async (input) => {
                graphInput = input.graphInput;
                return graphBuilder(ownerCandidate)();
            },
            nowMs: () => nowMs,
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published", JSON.stringify(result));
        assert.equal(result.sourceStatuses.find((status) => status.source === "agent_session")?.state, "current");
        assert.equal((0, node_fs_1.statSync)(agentSnapshotPath).mode & 0o777, 0o600);
        const agentSource = graphInput?.sources.find((source) => source.source === "agent_session");
        assert.match(agentSource?.revision ?? "", /^[a-f0-9]{64}$/);
        assert.equal(agentSource?.value?.metadata.producerResultDigest, agentSource?.revision);
        assert.equal(agentSource?.value?.recordCount, 1);
        assert.equal(agentSource?.value?.metadata.codexSessionCount, 1);
        assert.equal(agentSource?.value?.metadata.claudeSessionCount, 0);
        assert.equal(agentSource?.value?.metadata.contextOnly, true);
        assert.ok(agentSource?.value?.semanticAdmission);
        assert.equal(Object.hasOwn(agentSource?.value ?? {}, "semanticAdmissions"), false, "the native source slice must persist only the v2 semantic admission");
        const safeSlice = JSON.stringify(agentSource?.value);
        for (const forbidden of [
            privatePath,
            "Build the demo",
            "private reasoning",
            "private-tool-argument",
            "Prepared the bounded local package",
        ]) {
            assert.equal(safeSlice.includes(forbidden), false);
        }
        const boundedProducer = (0, node_fs_1.readFileSync)(agentSnapshotPath, "utf8");
        assert.equal(boundedProducer.includes(privatePath), false);
        assert.equal(boundedProducer.includes("private reasoning"), false);
        assert.equal(boundedProducer.includes("private-tool-argument"), false);
        assert.equal(boundedProducer.includes("[local-path]"), true);
        const smallSnapshot = JSON.parse(boundedProducer);
        assert.equal(smallSnapshot.coverage, "complete");
        assert.equal(smallSnapshot.observedCount, 1);
        assert.deepEqual(smallSnapshot.rejections, {
            episodeOverflow: 0,
            malformed: 0,
            missingIdentity: 0,
            missingUserRequest: 0,
            oversize: 0,
        });
        assert.deepEqual(smallSnapshot.sessions.map((session) => ({
            user: session.userDirectiveSummary,
            assistant: session.assistantOutcomeSummary,
        })), [{
                user: "Build the demo from [local-path]",
                assistant: "Prepared the bounded local package.",
            }]);
    });
    (0, node_test_1.it)("publishes one review-only task from a fresh owner-bound Agent Session admission alone", async () => {
        const locations = roots("taskmap-native-agent-only-");
        const agent = slice("agent_session");
        const emojiDirective = `Plan ${"😀".repeat(170)}`;
        agent.value.semanticAdmission = task4AgentAdmission([
            task4Work("agent-only-root", "/repo/agent-only", emojiDirective, "agent-only-turn"),
        ]);
        agent.sliceDigest = (0, source_contracts_js_1.taskMapContractDigest)(agent.value);
        const service = new TaskMapNativeRefreshService({
            ...locations,
            collectors: {
                agent_session: async () => agent,
                meeting_notes: async () => {
                    throw new Error("meeting connector unavailable");
                },
                calendar: async () => {
                    throw new Error("calendar connector unavailable");
                },
                body: async () => {
                    throw new Error("body connector unavailable");
                },
            },
            nowMs: () => Date.parse("2026-07-30T08:01:00.000Z"),
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published");
        const projection = JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8"));
        assert.deepEqual((0, harness_js_1.taskMapProjectionArtifactValidationReasons)(projection), []);
        assert.equal(projection.tasks.length, 1);
        assert.ok(projection.tasks[0]?.title.length <= 96);
        assert.ok(projection.tasks[0]?.summary.length <= 200);
        assert.equal(projection.tasks[0]?.title.endsWith("…"), true);
        assert.equal(projection.tasks[0]?.summary.endsWith("…"), true);
        assert.equal(projection.tasks[0].reviewState, "proposed");
        assert.equal(projection.tasks[0].authority, "none");
        assert.deepEqual(projection.edges.map((edge) => ({
            from: edge.from,
            to: edge.to,
            relation: edge.relation,
        })), [{
                from: projection.roots[0].id,
                to: projection.tasks[0].id,
                relation: "advances",
            }]);
        assert.deepEqual(projection.tasks[0].citations.map((citation) => citation.sourceKind), ["codex_session"]);
        assert.equal(result.sourceStatuses.find((status) => status.source === "agent_session")?.state, "current");
    });
    (0, node_test_1.it)("publishes one agent task when one envelope repeats a normalized mention identity", async () => {
        const locations = roots("taskmap-native-agent-duplicate-mention-");
        const directive = "Implement duplicate mention folding";
        const agent = admittedAgentSessionSlice(directive, "agent-duplicate-mention");
        const service = new TaskMapNativeRefreshService({
            ...locations,
            collectors: {
                agent_session: async () => agent,
                meeting_notes: async () => {
                    throw new Error("meeting connector unavailable");
                },
                calendar: async () => {
                    throw new Error("calendar connector unavailable");
                },
                body: async () => {
                    throw new Error("body connector unavailable");
                },
            },
            createAgentSessionExtractionStation: async () => {
                const station = await testMentionExtractionStation();
                return {
                    ...station,
                    async run(request) {
                        const envelope = await station.run(request);
                        return {
                            ...envelope,
                            outputJson: JSON.stringify({
                                mentions: [
                                    {
                                        text: directive,
                                        title: "Lower-confidence other request",
                                        class: "request",
                                        actor: "other",
                                        confidence: 0.7,
                                    },
                                    {
                                        text: directive,
                                        title: "Higher-confidence self request",
                                        class: "request",
                                        actor: "self",
                                        confidence: 0.9,
                                    },
                                ],
                            }),
                        };
                    },
                };
            },
            nowMs: () => Date.parse("2026-07-30T08:01:00.000Z"),
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published", JSON.stringify(result));
        const projection = committedGeneration(locations.projectionPath).projection;
        assert.equal(projection.tasks.length, 1);
        assert.equal(projection.tasks[0]?.title, "Higher-confidence self request");
        assert.equal(new Set(projection.tasks.map(({ id }) => id)).size, 1);
    });
    (0, node_test_1.it)("retains published agent proposals and reports pending extraction when Station-1 is unavailable", async () => {
        const locations = roots("taskmap-native-agent-station-down-");
        let agent = admittedAgentSessionSlice("Keep the previously extracted task", "agent-station-up");
        const sourceCollectors = {
            agent_session: async () => agent,
            meeting_notes: async () => {
                throw new Error("meeting connector unavailable");
            },
            calendar: async () => {
                throw new Error("calendar connector unavailable");
            },
            body: async () => {
                throw new Error("body connector unavailable");
            },
        };
        const first = new TaskMapNativeRefreshService({
            ...locations,
            collectors: sourceCollectors,
            nowMs: () => Date.parse("2026-07-30T08:01:00.000Z"),
        });
        assert.equal((await first.requestRefresh("manual")).refreshStatus, "published");
        const predecessor = committedGeneration(locations.projectionPath).projection;
        agent = admittedAgentSessionSlice("Do not publish this uncached task", "agent-station-down");
        const second = new TaskMapNativeRefreshService({
            ...locations,
            collectors: sourceCollectors,
            createAgentSessionExtractionStation: async () => {
                throw new llm_station_js_1.LlmStationUnavailableError("no_provider");
            },
            nowMs: () => Date.parse("2026-07-30T08:02:00.000Z"),
        });
        const degraded = await second.requestRefresh("manual");
        assert.equal(degraded.refreshStatus, "published");
        assert.deepEqual(committedGeneration(locations.projectionPath).projection.tasks.map(({ id, title }) => ({ id, title })), predecessor.tasks.map(({ id, title }) => ({ id, title })));
        assert.deepEqual(degraded.sourceStatuses.find((status) => status.source === "agent_session"), {
            source: "agent_session",
            disposition: "fresh",
            stationDegradationCode: "no_provider",
            stationPendingCount: 1,
            state: "current",
            lastSuccessAtMs: Date.parse("2026-07-30T08:02:00.000Z"),
            nextDueAtMs: Date.parse("2026-07-30T12:02:00.000Z"),
            proof: "local_source_read",
        });
        agent = admittedAgentSessionSlice("Keep pending after report-level extraction failure", "agent-report-failure");
        let missingPromptFactoryCalls = 0;
        const reportFailureService = new TaskMapNativeRefreshService({
            ...locations,
            collectors: sourceCollectors,
            agentSessionExtractionPromptTemplatePath: node_path_1.default.join(locations.runtimeRoot, "missing-agent-prompt.md"),
            createAgentSessionExtractionStation: async () => {
                missingPromptFactoryCalls += 1;
                throw new Error("station must not be created");
            },
            nowMs: () => Date.parse("2026-07-30T08:03:00.000Z"),
        });
        const reportFailure = await reportFailureService.requestRefresh("manual");
        assert.notEqual(reportFailure.refreshStatus, "unavailable");
        assert.equal(reportFailure.sourceStatuses.find((status) => status.source === "agent_session")?.stationDegradationCode, "prompt_template_missing");
        assert.equal(reportFailure.sourceStatuses.find((status) => status.source === "agent_session")?.stationPendingCount, 1);
        assert.equal(missingPromptFactoryCalls, 0);
    });
    (0, node_test_1.it)("runs Station-2 on projection work text, never source digests, and replays it", async () => {
        const locations = roots("taskmap-native-identity-station-");
        const billingFix = "Ship the identity station integration";
        const billingCorrection = "Finish the billing correction";
        const agent = admittedAgentSessionSlice(billingFix, "identity-station");
        agent.value.semanticAdmission = task4AgentAdmission([
            task4Work("identity-station-a", "/repo/identity-station", billingFix),
            task4Work("identity-station-b", "/repo/identity-station", billingCorrection),
        ]);
        agent.value.records = [{
                identityDigest: "a".repeat(64),
                revision: digest("production-agent-revision-a"),
                occurredAtMs: 100,
            }, {
                identityDigest: "b".repeat(64),
                revision: digest("production-agent-revision-b"),
                occurredAtMs: 101,
            }];
        agent.value.recordCount = 2;
        agent.sliceDigest = (0, source_contracts_js_1.taskMapContractDigest)(agent.value);
        let embeddingCalls = 0;
        let embeddedTexts = [];
        let stationCalls = 0;
        const serviceOptions = {
            ...locations,
            collectors: {
                agent_session: async () => agent,
                meeting_notes: async () => { throw new Error("meeting unavailable"); },
                calendar: async () => { throw new Error("calendar unavailable"); },
                body: async () => { throw new Error("body unavailable"); },
            },
            identityEmbeddingProvider: {
                embed: async (texts) => {
                    embeddingCalls += 1;
                    embeddedTexts = [...texts];
                    return texts.map((_text, index) => {
                        const result = new Array(768).fill(0);
                        result[0] = index === 0 ? 1 : 0.9;
                        result[1] = index === 0 ? 0 : Math.sqrt(1 - 0.9 ** 2);
                        return result;
                    });
                },
            },
            identityEmbeddingModelId: "fixture-embedding-v1",
            createAgentSessionExtractionStation: async () => {
                const extractionStation = await testMentionExtractionStation();
                return {
                    ...extractionStation,
                    async run(request) {
                        const directive = request.promptText.includes(billingCorrection)
                            ? billingCorrection
                            : billingFix;
                        const envelope = await extractionStation.run(request);
                        return {
                            ...envelope,
                            outputJson: JSON.stringify({
                                mentions: [{
                                        text: directive,
                                        title: directive,
                                        class: "request",
                                        actor: "self",
                                        confidence: 0.9,
                                    }],
                            }),
                        };
                    },
                };
            },
            createIdentityAdjudicationStation: async () => {
                stationCalls += 1;
                return {
                    provider: {
                        transport: "gemini-remote",
                        executable: "",
                        args: [],
                        model: "gemini-fixture",
                    },
                    async run(request) {
                        const prompt = JSON.parse(request.promptText);
                        return {
                            stationId: "identity-adjudication-v1",
                            model: "gemini-fixture",
                            promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                            inputDigest: request.inputDigest,
                            outputJson: JSON.stringify({
                                verdicts: prompt.pairs.map(({ pairId }) => ({
                                    pairId,
                                    verdict: "same_work",
                                })),
                            }),
                            producedAt: "2026-08-04T10:00:00.000Z",
                            transport: "gemini-remote",
                        };
                    },
                };
            },
            nowMs: () => Date.parse("2026-08-04T10:00:00.000Z"),
        };
        const first = await new TaskMapNativeRefreshService(serviceOptions)
            .requestRefresh("manual");
        assert.deepEqual(first.stationStatuses?.find((status) => status.stationId === "identity-adjudication-v1"), {
            stationId: "identity-adjudication-v1",
            state: "current",
            pendingCount: 0,
            degradationCode: null,
            lastSuccessAtMs: Date.parse("2026-08-04T10:00:00.000Z"),
        });
        assert.equal(embeddingCalls, 1);
        assert.deepEqual(embeddedTexts, [billingFix, billingCorrection].sort());
        assert.equal(embeddedTexts.some((text) => /(?:^|:)[a-f0-9]{64}$/.test(text)), false);
        assert.equal(stationCalls, 1);
        const identityDirectory = node_path_1.default.join(node_path_1.default.dirname(locations.projectionPath), "identity-adjudication");
        const artifactName = (0, node_fs_1.readdirSync)(identityDirectory)[0];
        const artifactBytes = (0, node_fs_1.readFileSync)(node_path_1.default.join(identityDirectory, artifactName), "utf8");
        assert.equal(artifactBytes.includes('"aliasesWritten":false'), true);
        const projectionBytes = (0, node_fs_1.readFileSync)(locations.projectionPath, "utf8");
        assert.equal(projectionBytes.includes("tmidentitypair_"), false);
        const identitySurface = await (0, llm_proposal_surface_js_1.loadTaskMapLlmProposalSurface)({
            taskMapRoot: node_path_1.default.dirname(locations.projectionPath),
            ownerScopeDigest: TEST_OWNER_SCOPE.ownerScopeDigest,
            projection: JSON.parse(projectionBytes),
        });
        assert.ok(identitySurface);
        assert.equal(identitySurface.possibleDuplicates.proposals.length, 1);
        assert.equal(identitySurface.authority.aliasesWritten, false);
        assert.equal(identitySurface.authority.acceptanceAuthority, false);
        const replayed = await new TaskMapNativeRefreshService({
            ...serviceOptions,
            identityEmbeddingProvider: {
                embed: async () => { throw new Error("must replay"); },
            },
            createIdentityAdjudicationStation: async () => {
                throw new Error("must replay");
            },
            nowMs: () => Date.parse("2026-08-04T10:01:00.000Z"),
        }).requestRefresh("manual");
        assert.equal(replayed.stationStatuses?.[0]?.state, "current");
        assert.equal(embeddingCalls, 1);
        assert.equal(stationCalls, 1);
        assert.equal((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8"), projectionBytes);
    });
    (0, node_test_1.it)("shares one bounded remote request group across refresh stations and embedding batches", async () => {
        const locations = roots("taskmap-native-remote-request-group-");
        const firstTitle = "Ship grouped cloud inference";
        const secondTitle = "Verify grouped cloud inference";
        const agent = admittedAgentSessionSlice(firstTitle, "remote-request-group");
        agent.value.semanticAdmission = task4AgentAdmission([
            task4Work("remote-group-a", "/repo/remote-group", firstTitle),
            task4Work("remote-group-b", "/repo/remote-group", secondTitle),
        ]);
        agent.value.records = [{
                identityDigest: "a".repeat(64),
                revision: digest("remote-group-revision-a"),
                occurredAtMs: 100,
            }, {
                identityDigest: "b".repeat(64),
                revision: digest("remote-group-revision-b"),
                occurredAtMs: 101,
            }];
        agent.value.recordCount = 2;
        agent.sliceDigest = (0, source_contracts_js_1.taskMapContractDigest)(agent.value);
        const requestGroups = [];
        const endpoints = [];
        const remoteFetch = (async (input, init) => {
            const endpoint = String(input);
            const body = JSON.parse(String(init?.body));
            requestGroups.push(String(body.request_group_id));
            endpoints.push(endpoint);
            if (endpoint.endsWith("/embed")) {
                const texts = body.texts;
                return new Response(JSON.stringify({
                    status: "success",
                    data: {
                        model: "gemini-fixture",
                        vectors: texts.map((_text, index) => {
                            const vector = new Array(768).fill(0);
                            vector[0] = index === 0 ? 1 : 0.9;
                            vector[1] = index === 0 ? 0 : Math.sqrt(1 - 0.9 ** 2);
                            return vector;
                        }),
                    },
                }), { status: 200 });
            }
            const stationId = body.station_id;
            const prompt = JSON.parse(String(body.prompt_text));
            const outputJson = stationId === "identity-adjudication-v1"
                ? JSON.stringify({
                    verdicts: (prompt.pairs ?? []).map(({ pairId }) => ({
                        pairId,
                        verdict: "same_work",
                    })),
                })
                : JSON.stringify({ proposals: [] });
            return new Response(JSON.stringify({
                status: "success",
                data: { output_json: outputJson, model: "gemini-fixture" },
            }), { status: 200 });
        });
        const credentialPlan = {
            ok: true,
            apiUrl: "https://api.daobrew.example",
            deviceCredential: "dbd_fixture_device_credential_123456789012345",
        };
        const extractionStation = await testMentionExtractionStation();
        const result = await new TaskMapNativeRefreshService({
            ...locations,
            collectors: {
                agent_session: async () => agent,
                meeting_notes: async () => { throw new Error("meeting unavailable"); },
                calendar: async () => { throw new Error("calendar unavailable"); },
                body: async () => { throw new Error("body unavailable"); },
            },
            createAgentSessionExtractionStation: async () => ({
                ...extractionStation,
                async run(request) {
                    const title = request.promptText.includes(secondTitle)
                        ? secondTitle
                        : firstTitle;
                    return {
                        ...await extractionStation.run(request),
                        outputJson: JSON.stringify({ mentions: [{
                                    text: title,
                                    title,
                                    class: "request",
                                    actor: "self",
                                    confidence: 0.9,
                                }] }),
                    };
                },
            }),
            defaultLlmStationOptions: {
                order: [],
                remoteConsent: "granted",
                remoteCredentialPlan: credentialPlan,
                remoteFetch,
                clock: () => new Date("2026-08-04T10:00:00.000Z"),
            },
            defaultRemoteEmbeddingOptions: {
                credentialPlan,
                fetchImpl: remoteFetch,
            },
            nowMs: () => Date.parse("2026-08-04T10:00:00.000Z"),
        }).requestRefresh("manual");
        assert.equal(result.refreshStatus, "published", JSON.stringify(result));
        assert.ok(endpoints.some((endpoint) => endpoint.endsWith("/embed")));
        assert.ok(endpoints.some((endpoint) => endpoint.endsWith("/generate")));
        assert.ok(requestGroups.length >= 2);
        assert.equal(new Set(requestGroups).size, 1);
        assert.match(requestGroups[0], /^refresh_[a-f0-9]{32}$/);
    });
    (0, node_test_1.it)("runs Station-3 after projection construction, persists proposal-only results, and replays them", async () => {
        const locations = roots("taskmap-native-decomposition-station-");
        writeReferencedPublicationPredecessor(locations.projectionPath, locations.currentnessPath, rankedExecutablePublicationCandidate(), "decomposition-station-predecessor");
        const meetingSnapshotPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "meeting-producer-snapshot.v1.json");
        writeMeetingProducerSnapshot(meetingSnapshotPath, {
            userId: TEST_OWNER_SCOPE.userId,
            producedAt: "2026-08-04T11:59:00.000Z",
            meetings: [meetingProducerMeeting("decomposition-station-meeting", "2026-08-04T11:00:00.000Z")],
        });
        let stationCalls = 0;
        const serviceOptions = {
            ...locations,
            meetingProducerSnapshotPath: meetingSnapshotPath,
            collectors: nonMeetingCollectors(),
            createDecompositionStation: async () => ({
                provider: {
                    transport: "gemini-remote",
                    executable: "",
                    args: [],
                    model: "gemini-fixture",
                },
                async run(request) {
                    stationCalls += 1;
                    const prompt = JSON.parse(request.promptText);
                    return {
                        stationId: "task-decomposition-v1",
                        model: "gemini-fixture",
                        promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                        inputDigest: request.inputDigest,
                        outputJson: JSON.stringify({ proposals: [{
                                    methodId: "verified-method",
                                    subtasks: [{
                                            title: "Verify the bounded child",
                                            summary: "Complete the bounded child action without creating descendants.",
                                            citationPointerIds: [prompt.workItem.citationPointerIds[0]],
                                        }],
                                }] }),
                        producedAt: "2026-08-04T12:00:00.000Z",
                        transport: "gemini-remote",
                    };
                },
            }),
            nowMs: () => Date.parse("2026-08-04T12:00:00.000Z"),
        };
        const first = await new TaskMapNativeRefreshService(serviceOptions)
            .requestRefresh("manual");
        assert.equal(first.refreshStatus, "published", JSON.stringify(first));
        assert.deepEqual(first.stationStatuses?.find((status) => status.stationId === "task-decomposition-v1"), {
            stationId: "task-decomposition-v1",
            state: "current",
            pendingCount: 0,
            degradationCode: null,
            lastSuccessAtMs: Date.parse("2026-08-04T12:00:00.000Z"),
        });
        assert.ok(stationCalls > 0 && stationCalls <= 3);
        const artifactDirectory = node_path_1.default.join(node_path_1.default.dirname(locations.projectionPath), "decomposition");
        const artifactName = (0, node_fs_1.readdirSync)(artifactDirectory)[0];
        const artifactBytes = (0, node_fs_1.readFileSync)(node_path_1.default.join(artifactDirectory, artifactName), "utf8");
        assert.equal(artifactBytes.includes('"nodesWritten":false'), true);
        assert.equal(artifactBytes.includes('"edgesWritten":false'), true);
        const projectionBytes = (0, node_fs_1.readFileSync)(locations.projectionPath, "utf8");
        assert.equal(projectionBytes.includes("tmdecomp_"), false);
        assert.equal(projectionBytes.includes("tmds_"), false);
        const decompositionSurface = await (0, llm_proposal_surface_js_1.loadTaskMapLlmProposalSurface)({
            taskMapRoot: node_path_1.default.dirname(locations.projectionPath),
            ownerScopeDigest: TEST_OWNER_SCOPE.ownerScopeDigest,
            projection: JSON.parse(projectionBytes),
        });
        assert.ok(decompositionSurface);
        assert.ok(decompositionSurface.suggestedBreakdowns.proposals.length > 0);
        assert.equal(decompositionSurface.authority.nodesWritten, false);
        assert.equal(decompositionSurface.authority.edgesWritten, false);
        assert.equal(decompositionSurface.authority.acceptanceAuthority, false);
        const replayed = await new TaskMapNativeRefreshService({
            ...serviceOptions,
            createDecompositionStation: async () => {
                throw new Error("must replay");
            },
            nowMs: () => Date.parse("2026-08-04T12:01:00.000Z"),
        }).requestRefresh("manual");
        assert.equal(replayed.stationStatuses?.find((status) => status.stationId === "task-decomposition-v1")?.state, "current");
        assert.equal((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8"), projectionBytes);
    });
    for (const source of ["agent_session", "calendar"]) {
        for (const degradation of [
            { name: "no CLI", code: "no_provider" },
            { name: "remote consent required", code: "remote_consent_required" },
            { name: "timeout", code: "provider_timeout" },
            { name: "rate limited", code: "provider_rate_limited" },
            { name: "malformed output", code: "invalid_extraction_output" },
            { name: "runner fault", code: "runner_failure" },
            { name: "missing template", code: "prompt_template_missing" },
        ]) {
            (0, node_test_1.it)(`publishes zero new ${source} proposals on ${degradation.name} and backfills the pending unit after recovery`, async () => {
                const locations = roots(`taskmap-native-task9-${source}-${degradation.code}-`);
                const assessedAt = "2026-08-03T20:05:00.000Z";
                const assessedAtMs = Date.parse(assessedAt);
                const meetingSnapshotPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "meeting-producer-snapshot.v1.json");
                writeMeetingProducerSnapshot(meetingSnapshotPath, {
                    userId: TEST_OWNER_SCOPE.userId,
                    producedAt: "2026-08-03T20:04:00.000Z",
                    meetings: [meetingProducerMeeting(`task9-${source}-${degradation.code}`, "2026-08-03T19:00:00.000Z", "complete")],
                });
                const predecessor = rankedExecutablePublicationCandidate();
                writeReferencedPublicationPredecessor(locations.projectionPath, locations.currentnessPath, predecessor, `task9-${source}-${degradation.code}`);
                const acceptedPredecessorIds = predecessor.projection.tasks
                    .filter((task) => task.reviewState === "accepted")
                    .map((task) => task.id);
                const targetTitle = source === "agent_session"
                    ? `Backfill the pending Agent Session ${degradation.code} proposal`
                    : `Backfill the pending Calendar ${degradation.code} proposal`;
                const agentSlice = source === "agent_session"
                    ? (() => {
                        const value = slice("agent_session", `task9-agent-${degradation.code}-revision`);
                        value.value.semanticAdmission =
                            (0, agent_session_semantic_admission_js_1.buildTaskMapAgentSessionSemanticAdmission)((0, agent_session_producer_freshness_js_1.buildTaskMapAgentSessionProducerSnapshot)({
                                ownerScopeDigest: TEST_OWNER_SCOPE.ownerScopeDigest,
                                producedAt: "2026-08-03T20:04:00.000Z",
                                observations: [task4AgentObservation({
                                        root: `task9-agent-${degradation.code}-root`,
                                        route: "/repo/task9-agent-recovery",
                                        turns: [{
                                                id: `task9-agent-${degradation.code}-turn`,
                                                text: targetTitle,
                                                at: "2026-08-03T20:03:00.000Z",
                                            }],
                                    })],
                            }));
                        value.sliceDigest = (0, source_contracts_js_1.taskMapContractDigest)(value.value);
                        return value;
                    })()
                    : null;
                const calendarExportPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "calendar-export.json");
                if (source === "calendar") {
                    const eventIdentityDigest = (0, source_contracts_js_1.taskMapContractDigest)(`task9-calendar-event-${degradation.code}`);
                    const startAt = "2026-08-03T21:00:00.000Z";
                    const endAt = "2026-08-03T21:30:00.000Z";
                    (0, node_fs_1.writeFileSync)(calendarExportPath, (0, calendar_producer_freshness_js_1.taskMapLocalCalendarExportCanonicalJson)((0, calendar_producer_freshness_js_1.buildTaskMapLocalCalendarExport)({
                        ownerScopeDigest: TEST_OWNER_SCOPE.ownerScopeDigest,
                        producedAt: "2026-08-03T20:04:00.000Z",
                        events: [{
                                eventIdentityDigest,
                                crossProviderIdentityDigest: null,
                                revisionDigest: (0, calendar_producer_freshness_js_1.taskMapCalendarFieldDigest)(calendar_producer_freshness_js_1.TASKMAP_CALENDAR_EVENT_REVISION_DOMAIN, [eventIdentityDigest, targetTitle, startAt, endAt]),
                                title: targetTitle,
                                startAt,
                                endAt,
                            }],
                    })), { mode: 0o600 });
                }
                let degradedFactoryCalls = 0;
                let degradedRunCalls = 0;
                const degradedFactory = async () => {
                    degradedFactoryCalls += 1;
                    if (degradation.code === "no_provider") {
                        throw new llm_station_js_1.LlmStationUnavailableError("no_provider");
                    }
                    if (degradation.code === "remote_consent_required") {
                        throw new llm_station_js_1.LlmStationUnavailableError("remote_consent_required");
                    }
                    return {
                        provider: {
                            transport: "claude-cli",
                            executable: "/fixture/provider",
                            args: [],
                            model: "task9-degraded-model",
                        },
                        async run(request) {
                            degradedRunCalls += 1;
                            if (degradation.code === "provider_timeout") {
                                throw new llm_station_js_1.LlmStationUnavailableError("timeout", "claude-cli");
                            }
                            if (degradation.code === "provider_rate_limited") {
                                throw new llm_station_js_1.LlmStationUnavailableError("provider_rate_limited", "claude-cli");
                            }
                            if (degradation.code === "runner_failure") {
                                throw new Error("private runner fault");
                            }
                            return {
                                stationId: "mention-extraction-v1",
                                model: "task9-degraded-model",
                                promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                                inputDigest: request.inputDigest,
                                outputJson: "{",
                                producedAt: assessedAt,
                                transport: "claude-cli",
                            };
                        },
                    };
                };
                const commonOptions = {
                    ...locations,
                    meetingProducerSnapshotPath: meetingSnapshotPath,
                    sourcePaths: source === "calendar"
                        ? { calendarExportPath }
                        : undefined,
                    collectors: {
                        ...(source === "agent_session"
                            ? {
                                agent_session: async () => agentSlice,
                                calendar: async () => {
                                    throw new Error("calendar connector unavailable");
                                },
                            }
                            : {
                                agent_session: async () => {
                                    throw new Error("agent connector unavailable");
                                },
                            }),
                        body: async () => slice("body"),
                    },
                    nowMs: () => assessedAtMs,
                };
                const degraded = await new TaskMapNativeRefreshService({
                    ...commonOptions,
                    ...(source === "agent_session"
                        ? degradation.code === "prompt_template_missing"
                            ? {
                                agentSessionExtractionPromptTemplatePath: node_path_1.default.join(locations.runtimeRoot, "missing-agent-prompt.md"),
                                createAgentSessionExtractionStation: degradedFactory,
                            }
                            : { createAgentSessionExtractionStation: degradedFactory }
                        : degradation.code === "prompt_template_missing"
                            ? {
                                calendarExtractionPromptTemplatePath: node_path_1.default.join(locations.runtimeRoot, "missing-calendar-prompt.md"),
                                createCalendarExtractionStation: degradedFactory,
                            }
                            : { createCalendarExtractionStation: degradedFactory }),
                }).requestRefresh("manual");
                assert.notEqual(degraded.refreshStatus, "unavailable", JSON.stringify(degraded));
                if (degradation.code === "remote_consent_required") {
                    assert.equal(degraded.status, "partial");
                }
                assert.equal(degradedFactoryCalls, degradation.code === "prompt_template_missing" ? 0 : 1);
                assert.equal(degradedRunCalls, degradation.code === "no_provider"
                    || degradation.code === "remote_consent_required"
                    || degradation.code === "prompt_template_missing"
                    ? 0
                    : 1);
                const degradedSourceStatus = degraded.sourceStatuses.find((status) => status.source === source);
                assert.equal(degradedSourceStatus?.disposition, "fresh");
                assert.equal(degradedSourceStatus?.state, "current");
                assert.equal(degradedSourceStatus?.proof, "local_source_read");
                assert.equal(degradedSourceStatus?.stationDegradationCode, degradation.code);
                assert.equal(degradedSourceStatus?.stationPendingCount, 1);
                assert.equal(degradedSourceStatus?.lastSuccessAtMs, source === "agent_session"
                    ? assessedAtMs
                    : Date.parse("2026-08-03T20:04:00.000Z"));
                assert.equal(degradedSourceStatus?.nextDueAtMs, (degradedSourceStatus?.lastSuccessAtMs ?? 0) + 4 * 60 * 60 * 1_000);
                const meetingStatus = degraded.sourceStatuses.find((status) => status.source === "meeting_notes");
                assert.equal(meetingStatus?.disposition, "fresh");
                assert.equal(meetingStatus?.state, "current");
                assert.equal(meetingStatus?.stationDegradationCode, undefined);
                assert.equal(meetingStatus?.stationPendingCount, undefined);
                const degradedProjection = committedGeneration(locations.projectionPath).projection;
                const degradedProjectionText = JSON.stringify(degradedProjection);
                assert.equal(degradedProjectionText.includes(targetTitle), false);
                assert.equal(degradedProjectionText.includes("Agent workstream"), false);
                assert.ok(acceptedPredecessorIds.every((taskId) => degradedProjection.tasks.some((task) => task.id === taskId)));
                let recoveryFactoryCalls = 0;
                let recoveryRunCalls = 0;
                const recoveryFactory = async () => {
                    recoveryFactoryCalls += 1;
                    return {
                        provider: {
                            transport: "claude-cli",
                            executable: "/fixture/provider",
                            args: [],
                            model: "task9-recovery-model",
                        },
                        async run(request) {
                            recoveryRunCalls += 1;
                            return {
                                stationId: "mention-extraction-v1",
                                model: "task9-recovery-model",
                                promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                                inputDigest: request.inputDigest,
                                outputJson: JSON.stringify({ mentions: [{
                                            text: targetTitle,
                                            title: targetTitle,
                                            class: "request",
                                            actor: "self",
                                            confidence: 0.94,
                                        }] }),
                                producedAt: new Date(assessedAtMs + 60_000).toISOString(),
                                transport: "claude-cli",
                            };
                        },
                    };
                };
                const recovered = await new TaskMapNativeRefreshService({
                    ...commonOptions,
                    ...(source === "agent_session"
                        ? { createAgentSessionExtractionStation: recoveryFactory }
                        : { createCalendarExtractionStation: recoveryFactory }),
                    nowMs: () => assessedAtMs + 60_000,
                }).requestRefresh("manual");
                assert.notEqual(recovered.refreshStatus, "unavailable", JSON.stringify(recovered));
                assert.equal(recoveryFactoryCalls, 1);
                assert.equal(recoveryRunCalls, 1);
                const recoveredStatus = recovered.sourceStatuses.find((status) => status.source === source);
                assert.equal(recoveredStatus?.stationDegradationCode, undefined);
                assert.equal(recoveredStatus?.stationPendingCount, undefined);
                const recoveredProjection = committedGeneration(locations.projectionPath).projection;
                const recoveredAssessedAt = new Date(assessedAtMs + 60_000).toISOString();
                const recoveredShelf = source === "agent_session"
                    ? (0, agent_session_candidate_adapter_js_1.buildTaskMapAgentSessionCandidateReview)({
                        admission: agentSlice.value.semanticAdmission,
                        extraction: JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(locations.runtimeRoot, "taskmap-agent-session-extraction-report.v1.json"), "utf8")),
                        previous: null,
                        expectedOwnerScopeDigest: TEST_OWNER_SCOPE.ownerScopeDigest,
                        assessedAt: recoveredAssessedAt,
                    }).shelf
                    : (0, calendar_candidate_adapter_js_1.buildTaskMapCalendarCandidateReview)({
                        result: await (0, calendar_producer_freshness_js_1.loadTaskMapCalendarProducerResult)({
                            localExportPath: calendarExportPath,
                            googleSnapshotPath: node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "missing-google-calendar.json"),
                            assessedAt: recoveredAssessedAt,
                            expectedOwnerScopeDigest: TEST_OWNER_SCOPE.ownerScopeDigest,
                        }),
                        extraction: JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(locations.runtimeRoot, "taskmap-calendar-extraction-report.v1.json"), "utf8")),
                        previous: null,
                        expectedOwnerScopeDigest: TEST_OWNER_SCOPE.ownerScopeDigest,
                        assessedAt: recoveredAssessedAt,
                    }).shelf;
                assert.equal(recoveredShelf.candidates.length, 1);
                assert.equal(recoveredShelf.candidates[0]?.candidateFamily, source);
                assert.equal(recoveredShelf.candidates[0]?.title, targetTitle);
                assert.ok(acceptedPredecessorIds.every((taskId) => recoveredProjection.tasks.some((task) => task.id === taskId)));
                assert.equal(JSON.stringify(recoveredProjection).includes("Agent workstream"), false);
            });
        }
    }
    (0, node_test_1.it)("replays unchanged Agent Session and Calendar inputs without selecting or running Station-1", async () => {
        const locations = roots("taskmap-native-task9-station-replay-");
        const firstAt = "2026-08-03T20:05:00.000Z";
        const meetingSnapshotPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "meeting-producer-snapshot.v1.json");
        writeMeetingProducerSnapshot(meetingSnapshotPath, {
            userId: TEST_OWNER_SCOPE.userId,
            producedAt: "2026-08-03T20:04:00.000Z",
            meetings: [meetingProducerMeeting("task9-station-replay-meeting", "2026-08-03T19:00:00.000Z", "complete")],
        });
        const agentTitle = "Replay the unchanged Task 9 Agent Session input";
        const agent = slice("agent_session", "task9-station-replay-agent");
        agent.value.semanticAdmission = (0, agent_session_semantic_admission_js_1.buildTaskMapAgentSessionSemanticAdmission)((0, agent_session_producer_freshness_js_1.buildTaskMapAgentSessionProducerSnapshot)({
            ownerScopeDigest: TEST_OWNER_SCOPE.ownerScopeDigest,
            producedAt: "2026-08-03T20:04:00.000Z",
            observations: [task4AgentObservation({
                    root: "task9-station-replay-agent-root",
                    route: "/repo/task9-station-replay",
                    turns: [{
                            id: "task9-station-replay-agent-turn",
                            text: agentTitle,
                            at: "2026-08-03T20:03:00.000Z",
                        }],
                })],
        }));
        agent.sliceDigest = (0, source_contracts_js_1.taskMapContractDigest)(agent.value);
        const calendarTitle = "Replay the unchanged Task 9 Calendar input";
        const calendarExportPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "calendar-export.json");
        const eventIdentityDigest = (0, source_contracts_js_1.taskMapContractDigest)("task9-station-replay-calendar-event");
        const startAt = "2026-08-03T21:00:00.000Z";
        const endAt = "2026-08-03T21:30:00.000Z";
        (0, node_fs_1.writeFileSync)(calendarExportPath, (0, calendar_producer_freshness_js_1.taskMapLocalCalendarExportCanonicalJson)((0, calendar_producer_freshness_js_1.buildTaskMapLocalCalendarExport)({
            ownerScopeDigest: TEST_OWNER_SCOPE.ownerScopeDigest,
            producedAt: "2026-08-03T20:04:00.000Z",
            events: [{
                    eventIdentityDigest,
                    crossProviderIdentityDigest: null,
                    revisionDigest: (0, calendar_producer_freshness_js_1.taskMapCalendarFieldDigest)(calendar_producer_freshness_js_1.TASKMAP_CALENDAR_EVENT_REVISION_DOMAIN, [eventIdentityDigest, calendarTitle, startAt, endAt]),
                    title: calendarTitle,
                    startAt,
                    endAt,
                }],
        })), { mode: 0o600 });
        const commonOptions = {
            ...locations,
            meetingProducerSnapshotPath: meetingSnapshotPath,
            sourcePaths: { calendarExportPath },
            collectors: {
                agent_session: async () => agent,
                body: async () => slice("body"),
            },
        };
        const firstCalls = { factory: 0, run: 0 };
        const firstFactory = async () => {
            firstCalls.factory += 1;
            const station = await testMentionExtractionStation();
            return {
                ...station,
                async run(request) {
                    firstCalls.run += 1;
                    return station.run(request);
                },
            };
        };
        const first = await new TaskMapNativeRefreshService({
            ...commonOptions,
            createAgentSessionExtractionStation: firstFactory,
            createCalendarExtractionStation: firstFactory,
            nowMs: () => Date.parse(firstAt),
        }).requestRefresh("manual");
        assert.equal(first.refreshStatus, "published", JSON.stringify(first));
        assert.deepEqual(firstCalls, { factory: 2, run: 2 });
        const firstStatus = artifact(locations.runtimeRoot, "taskmap-refresh-status.v1.json");
        const firstProjection = (0, node_fs_1.readFileSync)(locations.projectionPath);
        const secondCalls = { factory: 0, run: 0 };
        const secondFactory = async () => {
            secondCalls.factory += 1;
            const station = await testMentionExtractionStation();
            return {
                ...station,
                async run(request) {
                    secondCalls.run += 1;
                    return station.run(request);
                },
            };
        };
        const replay = await new TaskMapNativeRefreshService({
            ...commonOptions,
            createAgentSessionExtractionStation: secondFactory,
            createCalendarExtractionStation: secondFactory,
            nowMs: () => Date.parse(firstAt),
        }).requestRefresh("manual");
        assert.notEqual(replay.refreshStatus, "unavailable", JSON.stringify(replay));
        assert.deepEqual(secondCalls, { factory: 0, run: 0 });
        const replayStatus = artifact(locations.runtimeRoot, "taskmap-refresh-status.v1.json");
        assert.equal(replayStatus.candidateDigest, firstStatus.candidateDigest);
        assert.equal(replayStatus.projectionDigest, firstStatus.projectionDigest);
        assert.deepEqual((0, node_fs_1.readFileSync)(locations.projectionPath), firstProjection);
    });
    (0, node_test_1.it)("publishes a valid Agent Session task when Meet notes are fresh-empty", async () => {
        const locations = roots("taskmap-native-agent-with-empty-meet-");
        const snapshotPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "meeting-producer-snapshot.v1.json");
        const userId = TEST_OWNER_SCOPE.userId;
        writeMeetingProducerSnapshot(snapshotPath, {
            userId,
            producedAt: "2026-07-30T08:00:00.000Z",
            meetings: [],
        });
        const service = new TaskMapNativeRefreshService({
            ...locations,
            meetingProducerSnapshotPath: snapshotPath,
            collectors: {
                agent_session: async () => admittedAgentSessionSlice("Review the quarterly customer research summary", "agent-with-empty-meet"),
                calendar: async () => slice("calendar"),
                body: async () => slice("body"),
            },
            nowMs: () => Date.parse("2026-07-30T08:01:00.000Z"),
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published");
        const projection = JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8"));
        assert.deepEqual(projection.tasks.map((task) => task.title), ["Review the quarterly customer research summary"]);
        const generation = committedGeneration(locations.projectionPath);
        assert.deepEqual(generation.ranking?.rankedAcceptedOpen, []);
        assert.equal(generation.currentWork, null);
        assert.deepEqual(generation.readyProofTargets?.proofTargets, []);
    });
    (0, node_test_1.it)("rebuilds all latest-per-root Agent Session history after derived state is wiped", async () => {
        const locations = roots("taskmap-native-agent-history-rebuild-");
        const agent = admittedAgentSessionSlice("Restore the Codex-side Task Map workflow", "agent-history-codex");
        agent.value.semanticAdmission = task4AgentAdmission([
            task4Work("agent-history-codex-root", "/repo/agent-history-codex", "Restore the Codex-side Task Map workflow", "agent-history-codex-turn"),
            task4Work("agent-history-claude-root", "/repo/agent-history-claude", "Restore the Claude-side Task Map workflow", "agent-history-claude-turn", "claude"),
        ]);
        agent.sliceDigest = (0, source_contracts_js_1.taskMapContractDigest)(agent.value);
        const service = new TaskMapNativeRefreshService({
            ...locations,
            collectors: {
                agent_session: async () => agent,
                meeting_notes: async () => {
                    throw new Error("meeting connector unavailable after wipe");
                },
                calendar: async () => slice("calendar"),
                body: async () => slice("body"),
            },
            nowMs: () => Date.parse("2026-07-30T08:01:00.000Z"),
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published", JSON.stringify(result));
        const projection = committedGeneration(locations.projectionPath).projection;
        assert.equal(projection.roots.length, 2);
        assert.deepEqual(projection.tasks.map((task) => task.title).sort(), [
            "Restore the Claude-side Task Map workflow",
            "Restore the Codex-side Task Map workflow",
        ]);
        assert.deepEqual([...new Set(projection.sources.map((source) => source.sourceKind))]
            .sort(), ["claude_session", "codex_session"]);
        assert.ok(projection.tasks.every((task) => task.reviewState === "proposed" && task.authority === "none"));
    });
    (0, node_test_1.it)("falls back to a valid Agent Session task when Meet notes have no eligible work", async () => {
        const locations = roots("taskmap-native-agent-with-ineligible-meet-");
        const snapshotPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "meeting-producer-snapshot.v1.json");
        const userId = TEST_OWNER_SCOPE.userId;
        writeMeetingProducerSnapshot(snapshotPath, {
            userId,
            producedAt: "2026-07-30T08:00:00.000Z",
            meetings: [meetingProducerMeeting("single-ineligible-document", "2026-07-28T09:00:00.000Z")],
        });
        const service = new TaskMapNativeRefreshService({
            ...locations,
            meetingProducerSnapshotPath: snapshotPath,
            collectors: {
                agent_session: async () => admittedAgentSessionSlice("Prepare the support handoff for the next release", "agent-with-ineligible-meet"),
                calendar: async () => slice("calendar"),
                body: async () => slice("body"),
            },
            nowMs: () => Date.parse("2026-07-30T08:01:00.000Z"),
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published");
        const projection = JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8"));
        assert.deepEqual(projection.tasks.map((task) => task.title), ["Prepare the support handoff for the next release"]);
    });
    (0, node_test_1.it)("keeps the accepted predecessor when only a new Agent Session directive is available", async () => {
        const locations = roots("taskmap-native-agent-replaces-predecessor-");
        const predecessor = rankedExecutablePublicationCandidate();
        writeReferencedPublicationPredecessor(locations.projectionPath, locations.currentnessPath, predecessor, "agent-replaces-predecessor");
        const predecessorTaskIDs = predecessor.projection.tasks.map(({ id }) => id);
        const snapshotPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "meeting-producer-snapshot.v1.json");
        writeMeetingProducerSnapshot(snapshotPath, {
            userId: TEST_OWNER_SCOPE.userId,
            producedAt: "2026-07-30T08:00:00.000Z",
            meetings: [],
        });
        const service = new TaskMapNativeRefreshService({
            ...locations,
            meetingProducerSnapshotPath: snapshotPath,
            collectors: {
                agent_session: async () => admittedAgentSessionSlice("Draft the migration notice for affected customers", "agent-replaces-predecessor"),
                calendar: async () => slice("calendar"),
                body: async () => slice("body"),
            },
            nowMs: () => Date.parse("2026-07-30T08:01:00.000Z"),
        });
        const result = await service.requestRefresh("manual");
        // Source-currentness publication may advance the immutable generation,
        // but an Agent Session directive alone must not replace accepted work.
        assert.equal(result.refreshStatus, "published", JSON.stringify(result));
        assert.equal(result.publicationVerified, true);
        const projection = JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8"));
        assert.deepEqual(projection.tasks.map(({ id }) => id), predecessorTaskIDs);
        assert.deepEqual(projection, predecessor.projection);
        const generation = committedGeneration(locations.projectionPath);
        assert.deepEqual(generation.projection, predecessor.projection);
        assert.deepEqual(generation.currentness, {
            ...predecessor.currentness,
            taskDispositions: [
                ...predecessor.currentness.taskDispositions,
            ].sort((left, right) => left.taskId.localeCompare(right.taskId)),
        });
        assert.deepEqual(generation.ranking, predecessor.ranking);
    });
    (0, node_test_1.it)("replaces a proposed Agent Session predecessor with the latest admitted directive", async () => {
        const locations = roots("taskmap-native-agent-replaces-proposed-");
        const snapshotPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "meeting-producer-snapshot.v1.json");
        writeMeetingProducerSnapshot(snapshotPath, {
            userId: TEST_OWNER_SCOPE.userId,
            producedAt: "2026-07-30T08:00:00.000Z",
            meetings: [],
        });
        const first = new TaskMapNativeRefreshService({
            ...locations,
            meetingProducerSnapshotPath: snapshotPath,
            collectors: {
                agent_session: async () => admittedAgentSessionSlice("The following is obsolete continuation metadata", "agent-proposed-old"),
                calendar: async () => slice("calendar"),
                body: async () => slice("body"),
            },
            nowMs: () => Date.parse("2026-07-30T08:01:00.000Z"),
        });
        assert.equal((await first.requestRefresh("manual")).refreshStatus, "published");
        const currentAdmissionSlice = admittedAgentSessionSlice("Repair the Task Map publication", "agent-proposed-current");
        const second = new TaskMapNativeRefreshService({
            ...locations,
            meetingProducerSnapshotPath: snapshotPath,
            collectors: {
                agent_session: async () => currentAdmissionSlice,
                calendar: async () => slice("calendar"),
                body: async () => slice("body"),
            },
            nowMs: () => Date.parse("2026-07-30T08:02:00.000Z"),
        });
        const result = await second.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published", JSON.stringify(result));
        const projection = committedGeneration(locations.projectionPath).projection;
        assert.deepEqual(projection.tasks.map((task) => ({
            title: task.title,
            reviewState: task.reviewState,
        })), [{
                title: "Repair the Task Map publication",
                reviewState: "proposed",
            }]);
        const noise = slice("agent_session", "agent-proposed-noise");
        noise.value.semanticAdmission = task4AgentAdmission([
            task4AgentObservation({
                root: "agent-proposed-noise-root",
                route: "/repo/agent-proposed-current",
                turns: [
                    {
                        id: "agent-proposed-old-turn",
                        text: "Repair the Task Map publication",
                        at: "2026-07-30T07:00:00.000Z",
                    },
                    {
                        id: "agent-proposed-stop-turn",
                        text: "stop",
                        at: "2026-07-30T07:01:00.000Z",
                    },
                ],
            }),
        ]);
        noise.sliceDigest = (0, source_contracts_js_1.taskMapContractDigest)(noise.value);
        const third = new TaskMapNativeRefreshService({
            ...locations,
            meetingProducerSnapshotPath: snapshotPath,
            collectors: {
                agent_session: async () => noise,
                meeting_notes: async () => {
                    throw new Error("meeting connector unavailable");
                },
                calendar: async () => slice("calendar"),
                body: async () => slice("body"),
            },
            nowMs: () => Date.parse("2026-07-30T08:03:00.000Z"),
        });
        assert.equal((await third.requestRefresh("manual")).refreshStatus, "published");
        const retired = committedGeneration(locations.projectionPath);
        assert.deepEqual(retired.projection.roots, []);
        assert.deepEqual(retired.projection.tasks, []);
        assert.deepEqual(retired.projection.edges, []);
        assert.deepEqual(retired.ranking?.rankedAcceptedOpen, []);
        assert.equal(retired.currentWork, null);
        assert.deepEqual(retired.readyProofTargets?.proofTargets, []);
    });
    (0, node_test_1.it)("publishes candidates from both eligible Meet notes and an admitted Agent Session", async () => {
        const locations = roots("taskmap-native-agent-and-meet-");
        const snapshotPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "meeting-producer-snapshot.v1.json");
        writeMeetingProducerSnapshot(snapshotPath, {
            userId: TEST_OWNER_SCOPE.userId,
            producedAt: "2026-07-30T08:00:00.000Z",
        });
        const service = new TaskMapNativeRefreshService({
            ...locations,
            meetingProducerSnapshotPath: snapshotPath,
            collectors: {
                agent_session: async () => admittedAgentSessionSlice("Summarize the onboarding feedback for the product team", "agent-and-meet"),
                calendar: async () => slice("calendar"),
                body: async () => slice("body"),
            },
            nowMs: () => Date.parse("2026-07-30T08:01:00.000Z"),
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published");
        const projection = JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8"));
        assert.equal(projection.tasks.some(({ title }) => title === "Summarize the onboarding feedback for the product team"), true);
        assert.equal(projection.tasks.some(({ title }) => title === "Ship the native semantic refresh"), true);
        assert.equal((0, harness_js_1.taskMapProjectionArtifactValidationReasons)(projection).length, 0);
    });
    (0, node_test_1.it)("keeps Meeting roots and tasks when the Agent Plan2 filter is active", async () => {
        const locations = roots("taskmap-native-meeting-plan2-passthrough-");
        const ownerUserId = "synthetic-meeting-plan2-passthrough-owner";
        const owner = (0, confirmed_owner_js_1.confirmedTestOwner)(ownerUserId);
        (0, node_fs_1.rmSync)(owner.taskMapRoot, { recursive: true, force: true });
        (0, node_fs_1.mkdirSync)(owner.taskMapRoot, { recursive: true, mode: 0o700 });
        const snapshotPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "meeting-producer-snapshot.v1.json");
        writeMeetingProducerSnapshot(snapshotPath, {
            userId: ownerUserId,
            producedAt: "2026-07-30T08:00:00.000Z",
        });
        const directive = "Advance the Plan2 passthrough migration";
        const secondDirective = "Verify the Plan2 passthrough coverage";
        const observations = [
            task4Work("plan2-passthrough-root", "/repo/plan2-passthrough", directive, "plan2-passthrough-turn"),
            task4Work("plan2-passthrough-verify", "/repo/plan2-passthrough-verify", secondDirective, "plan2-passthrough-verify-turn"),
        ];
        const communityStation = {
            provider: {
                transport: "claude-cli",
                executable: "/fixture/provider",
                args: [],
                model: "plan2-passthrough-fixture",
            },
            async run(request) {
                const payload = JSON.parse(request.promptText.split("\n").at(-1) ?? "{}");
                return {
                    stationId: request.stationId,
                    model: "plan2-passthrough-fixture",
                    promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                    inputDigest: request.inputDigest,
                    outputJson: request.stationId === "community-title-v1"
                        ? JSON.stringify({
                            titles: (payload.communities ?? []).map((community) => ({
                                baseRootProposalId: community.baseRootProposalId,
                                title: "Plan2 passthrough workstream",
                            })),
                        })
                        : JSON.stringify({
                            groups: [{
                                    nodeIds: (payload.nodes ?? []).map((node) => node.nodeId),
                                }],
                        }),
                    producedAt: "2026-07-30T08:01:00.000Z",
                    transport: "claude-cli",
                };
            },
        };
        const service = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId,
            meetingProducerSnapshotPath: snapshotPath,
            collectors: {
                agent_session: async () => {
                    const agent = slice("agent_session", "plan2-passthrough-revision");
                    agent.value.semanticAdmission = task4AgentAdmission(observations, owner.ownerScopeDigest);
                    agent.sliceDigest = (0, source_contracts_js_1.taskMapContractDigest)(agent.value);
                    return agent;
                },
                calendar: async () => slice("calendar"),
                body: async () => slice("body"),
            },
            createCommunityGroupingStation: async () => communityStation,
            communityPlanEmbeddingProvider: null,
            agentSessionGraphFeedForTesting: (0, agent_session_semantic_admission_js_1.buildTaskMapAgentSessionGraphFeed)({
                ownerScopeDigest: owner.ownerScopeDigest,
                producedAt: "2026-07-30T08:00:00.000Z",
                observations,
            }),
            nowMs: () => Date.parse("2026-07-30T08:01:00.000Z"),
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published", JSON.stringify(result));
        const projection = JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8"));
        // The Plan2 filter reshapes only the Agent sub-projection: the Meeting
        // root and its task must pass through composition untouched.
        assert.equal(projection.tasks.some(({ title }) => title === "Ship the native semantic refresh"), true);
        assert.equal(projection.tasks.some(({ title }) => title === directive), true);
        assert.equal(projection.roots.some(({ title }) => title === "Plan2 passthrough workstream"), true);
        const meetingTask = projection.tasks.find(({ title }) => title === "Ship the native semantic refresh");
        assert.equal(projection.roots.some((root) => root.id === meetingTask.rootId
            && root.title !== "Plan2 passthrough workstream"), true);
        assert.equal((0, harness_js_1.taskMapProjectionArtifactValidationReasons)(projection).length, 0);
    });
    (0, node_test_1.it)("does not publish an empty genesis when only context receipts are current", async () => {
        const locations = roots("taskmap-native-context-only-");
        const service = new TaskMapNativeRefreshService({
            ...locations,
            collectors: {
                agent_session: async () => {
                    throw new Error("agent connector unavailable");
                },
                meeting_notes: async () => {
                    throw new Error("meeting connector unavailable");
                },
                calendar: async () => slice("calendar"),
                body: async () => slice("body"),
            },
            nowMs: () => Date.parse("2026-07-30T08:01:00.000Z"),
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "unavailable");
        assert.equal(result.publicationVerified, false);
        assert.equal(result.publicationBlockReason, "semantic_provider_unavailable");
        assert.equal((0, node_fs_1.existsSync)(locations.projectionPath), false);
        assert.equal((0, node_fs_1.existsSync)(locations.currentnessPath), false);
        assert.equal((0, node_fs_1.existsSync)((0, native_refresh_service_js_1.nativeTaskRankingPath)(locations.projectionPath)), false);
        assert.deepEqual(result.sourceStatuses.map((status) => [status.source, status.state]), [
            ["agent_session", "unavailable"],
            ["meeting_notes", "unavailable"],
            ["calendar", "current"],
            ["body", "current"],
        ]);
    });
    (0, node_test_1.it)("publishes extracted task topics when live community planning is unavailable", async () => {
        const locations = roots("taskmap-native-taskless-semantic-genesis-");
        const ownerUserId = "taskless-semantic-genesis-owner";
        const owner = (0, confirmed_owner_js_1.confirmedTestOwner)(ownerUserId);
        (0, node_fs_1.rmSync)(owner.taskMapRoot, { recursive: true, force: true });
        (0, node_fs_1.mkdirSync)(owner.taskMapRoot, { recursive: true, mode: 0o700 });
        const directive = "Keep connected Agent work visible in the Roadmap";
        const observations = [
            task4Work("taskless-semantic-genesis-root-a", "/repo/taskless-semantic-genesis", directive),
            task4Work("taskless-semantic-genesis-root-b", "/repo/taskless-semantic-genesis", "Group connected work into semantic Roadmap topics"),
            task4Work("taskless-semantic-genesis-root-c", "/repo/taskless-semantic-genesis", "Keep the candidate list selectable on the main page"),
            task4Work("taskless-semantic-genesis-root-d", "/repo/taskless-semantic-genesis", "Prevent accepted empty Roadmap publications"),
            task4Work("taskless-semantic-genesis-root-e", "/repo/taskless-semantic-genesis", "Verify the connected Roadmap still contains work"),
        ];
        const admission = task4AgentAdmission(observations, owner.ownerScopeDigest);
        const collectedAgent = slice("agent_session", admission.admissionDigest, admission.clusters[0].clusterIdentityDigest);
        collectedAgent.ownerScopeDigest = owner.ownerScopeDigest;
        collectedAgent.value.ownerScopeDigest = owner.ownerScopeDigest;
        collectedAgent.value.semanticAdmission = admission;
        collectedAgent.sliceDigest = (0, source_contracts_js_1.taskMapContractDigest)(collectedAgent.value);
        const service = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId,
            collectors: {
                agent_session: async () => collectedAgent,
                meeting_notes: async () => {
                    throw new Error("meeting connector unavailable");
                },
                calendar: async () => slice("calendar"),
                body: async () => slice("body"),
            },
            createAgentSessionExtractionStation: testMentionExtractionStation,
            createCommunityGroupingStation: async () => {
                throw new Error("semantic task planning unavailable");
            },
            communityPlanEmbeddingProvider: null,
            agentSessionGraphFeedForTesting: (0, agent_session_semantic_admission_js_1.buildTaskMapAgentSessionGraphFeed)({
                ownerScopeDigest: owner.ownerScopeDigest,
                producedAt: "2026-07-30T08:00:00.000Z",
                observations,
            }),
            nowMs: () => Date.parse("2026-07-30T08:01:00.000Z"),
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published", JSON.stringify(result));
        assert.equal(result.publicationVerified, true);
        assert.equal(result.publicationBlockReason, null);
        assert.equal((0, node_fs_1.existsSync)(locations.projectionPath), true);
        assert.equal((0, node_fs_1.existsSync)(locations.currentnessPath), true);
        const projection = JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8"));
        assert.ok(projection.roots.length > 0);
        assert.ok(projection.tasks.length > 0);
        assert.ok(projection.roots.every((root) => projection.tasks.some((task) => task.rootId === root.id)));
        const assessedAt = "2026-07-30T08:01:00.000Z";
        const extraction = await (0, agent_session_refresh_llm_replay_js_1.loadVerifiedTaskMapAgentSessionExtractionReport)({
            admission,
            taskMapRoot: owner.taskMapRoot,
            runtimeRoot: locations.runtimeRoot,
            ownerScopeDigest: owner.ownerScopeDigest,
            promptTemplatePath: node_path_1.default.resolve(__dirname, "../../prompts/agent-session-extraction-v1.md"),
        });
        assert.ok(extraction);
        const candidateReview = (0, agent_session_candidate_adapter_js_1.buildTaskMapAgentSessionCandidateReview)({
            admission,
            extraction,
            previous: null,
            expectedOwnerScopeDigest: owner.ownerScopeDigest,
            assessedAt,
        });
        assert.ok(candidateReview.shelf.candidates.length > 0, "candidate work remains available to the inline Roadmap surface");
    });
    (0, node_test_1.it)("reads a huge compacted Codex root through a bounded head and tail while retaining the latest explicit work episode", async () => {
        const locations = roots("taskmap-native-agent-huge-");
        const ownerUserId = "synthetic-huge-agent-owner";
        const ownerScopeDigest = (0, confirmed_owner_js_1.confirmedTestOwner)(ownerUserId).ownerScopeDigest;
        const ownerCandidate = publicationCandidate(0, loaderCompatibleProjection(), ownerScopeDigest);
        const sourceRoot = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "agent-sources");
        const codexRoot = node_path_1.default.join(sourceRoot, "codex");
        const claudeRoot = node_path_1.default.join(sourceRoot, "claude");
        (0, node_fs_1.mkdirSync)(codexRoot, { recursive: true, mode: 0o700 });
        (0, node_fs_1.mkdirSync)(claudeRoot, { recursive: true, mode: 0o700 });
        const nativeSessionIdentity = "codex-huge-root-session";
        const nativeParentIdentity = "codex-huge-parent-session";
        const hugePath = node_path_1.default.join(codexRoot, "huge-session.jsonl");
        const head = [
            {
                timestamp: "2026-07-30T05:00:00.000Z",
                type: "session_meta",
                payload: {
                    id: nativeSessionIdentity,
                    parent_id: nativeParentIdentity,
                },
            },
            {
                timestamp: "2026-07-30T05:00:10.000Z",
                type: "turn_context",
                payload: {
                    cwd: "/Users/private-owner/DaobrewAI",
                    workspace_roots: ["/Users/private-owner/DaobrewAI"],
                },
            },
            {
                timestamp: "2026-07-30T05:01:00.000Z",
                type: "response_item",
                payload: {
                    id: "head-only-old-turn",
                    type: "message",
                    role: "user",
                    content: [{
                            type: "input_text",
                            text: "This head-only episode must not replace current work",
                        }],
                },
            },
        ].map((row) => JSON.stringify(row)).join("\n") + "\n";
        const giantToolSecret = "giant-tool-secret-must-not-persist";
        const giantToolLine = JSON.stringify({
            timestamp: "2026-07-30T07:00:00.000Z",
            type: "response_item",
            payload: {
                type: "function_call_output",
                role: "tool",
                content: [{
                        type: "output_text",
                        text: giantToolSecret.repeat(40_000),
                    }],
            },
        });
        const tailRows = [
            {
                timestamp: "2026-07-30T07:10:00.000Z",
                type: "turn_context",
                payload: {
                    cwd: "/Users/private-owner/DaobrewAI",
                    workspace_roots: ["/Users/private-owner/DaobrewAI"],
                },
            },
            {
                timestamp: "2026-07-30T07:11:00.000Z",
                type: "response_item",
                payload: {
                    id: "huge-old-work-turn",
                    type: "message",
                    role: "user",
                    content: [{
                            type: "input_text",
                            text: "Prepare the old fundraising brief",
                        }],
                },
            },
            {
                timestamp: "2026-07-30T07:12:00.000Z",
                type: "response_item",
                payload: {
                    type: "message",
                    role: "assistant",
                    content: [{
                            type: "output_text",
                            text: "Prepared the old bounded brief.",
                        }],
                },
            },
            {
                timestamp: "2026-07-30T07:13:00.000Z",
                type: "response_item",
                payload: {
                    id: "huge-private-work-turn",
                    type: "message",
                    role: "user",
                    content: [{
                            type: "input_text",
                            text: "Review /Users/private-owner/private/task.md using api_key=private-secret-value",
                        }],
                },
            },
            {
                timestamp: "2026-07-30T07:14:00.000Z",
                type: "compacted",
                payload: {
                    summary: "Compaction summary must remain continuity-only",
                },
            },
            {
                timestamp: "2026-07-30T07:15:00.000Z",
                type: "response_item",
                payload: {
                    id: "huge-compaction-wrapper",
                    type: "message",
                    role: "user",
                    content: [{
                            type: "input_text",
                            text: "The conversation history was compacted. Repeat the old task.",
                        }],
                },
            },
            {
                timestamp: "2026-07-30T07:16:00.000Z",
                type: "response_item",
                payload: {
                    id: "huge-plugin-wrapper",
                    type: "message",
                    role: "user",
                    content: [{
                            type: "input_text",
                            text: "<recommended_plugins><plugin>noise</plugin></recommended_plugins>",
                        }],
                },
            },
            {
                timestamp: "2026-07-30T07:17:00.000Z",
                type: "response_item",
                payload: {
                    id: "huge-delegation-wrapper",
                    type: "message",
                    role: "user",
                    content: [{
                            type: "input_text",
                            text: "Message Type: NEW_TASK\nTask name: /root/child\nSender: /root\nPayload:\n<input>delegation noise</input>",
                        }],
                },
            },
            {
                timestamp: "2026-07-30T07:30:00.000Z",
                type: "turn_context",
                payload: {
                    cwd: "/Users/private-owner/DaobrewAI",
                    workspace_roots: ["/Users/private-owner/DaobrewAI"],
                },
            },
            {
                timestamp: "2026-07-30T07:31:00.000Z",
                type: "response_item",
                payload: {
                    id: "huge-complete-loop-turn",
                    type: "message",
                    role: "user",
                    content: [{
                            type: "input_text",
                            text: "<recommended_plugins><plugin>continuity</plugin></recommended_plugins>\n让这个 leaf node 先批准再 run，完成后保留 artifact；如果没有兄弟 leaf，就拆掉母节点。",
                        }],
                },
            },
            {
                timestamp: "2026-07-30T07:32:00.000Z",
                type: "response_item",
                payload: {
                    type: "message",
                    role: "assistant",
                    content: [{
                            type: "output_text",
                            text: "Prepared /tmp/private/report.html with Bearer private-secret-token-value.",
                        }],
                },
            },
            {
                timestamp: "2026-07-30T07:41:00.000Z",
                type: "response_item",
                payload: {
                    id: "huge-later-status-turn",
                    type: "message",
                    role: "user",
                    content: [{
                            type: "input_text",
                            text: "Why is the current goal blocked?",
                        }],
                },
            },
        ].map((row) => JSON.stringify(row)).join("\n") + "\n";
        const descriptor = (0, node_fs_1.openSync)(hugePath, "w", 0o600);
        try {
            (0, node_fs_1.writeSync)(descriptor, head, 0, "utf8");
            const sparseGapEnd = 617 * 1_024 * 1_024;
            (0, node_fs_1.ftruncateSync)(descriptor, sparseGapEnd);
            let position = sparseGapEnd;
            position += (0, node_fs_1.writeSync)(descriptor, "\n", position, "utf8");
            position += (0, node_fs_1.writeSync)(descriptor, `${giantToolLine}\n`, position, "utf8");
            (0, node_fs_1.writeSync)(descriptor, tailRows, position, "utf8");
        }
        finally {
            (0, node_fs_1.closeSync)(descriptor);
        }
        (0, node_fs_1.writeFileSync)(node_path_1.default.join(codexRoot, "later-unrelated-session.jsonl"), [
            JSON.stringify({
                timestamp: "2026-07-30T07:45:00.000Z",
                type: "session_meta",
                payload: { id: "later-unrelated-session" },
            }),
            JSON.stringify({
                timestamp: "2026-07-30T07:46:00.000Z",
                type: "turn_context",
                payload: {
                    cwd: "/Users/private-owner/OtherProject",
                    workspace_roots: ["/Users/private-owner/OtherProject"],
                },
            }),
            JSON.stringify({
                timestamp: "2026-07-30T07:47:00.000Z",
                type: "response_item",
                payload: {
                    id: "later-unrelated-turn",
                    type: "message",
                    role: "user",
                    content: [{
                            type: "input_text",
                            text: "Prepare the customer launch checklist",
                        }],
                },
            }),
        ].join("\n") + "\n", { mode: 0o600 });
        (0, node_fs_1.writeFileSync)(node_path_1.default.join(codexRoot, "stale-complete-loop-session.jsonl"), [
            JSON.stringify({
                timestamp: "2026-07-30T07:00:00.000Z",
                type: "session_meta",
                payload: { id: "stale-complete-loop-session" },
            }),
            JSON.stringify({
                timestamp: "2026-07-30T07:01:00.000Z",
                type: "turn_context",
                payload: {
                    cwd: "/Users/private-owner/DaobrewAI",
                    workspace_roots: ["/Users/private-owner/DaobrewAI"],
                },
            }),
            JSON.stringify({
                timestamp: "2026-07-30T07:20:00.000Z",
                type: "response_item",
                payload: {
                    id: "stale-complete-loop-turn",
                    type: "message",
                    role: "user",
                    content: [{
                            type: "input_text",
                            text: "Complete the loop",
                        }],
                },
            }),
            JSON.stringify({
                timestamp: "2026-07-30T07:40:00.000Z",
                type: "response_item",
                payload: {
                    id: "newer-unrelated-turn",
                    type: "message",
                    role: "user",
                    content: [{
                            type: "input_text",
                            text: "Continue unrelated work",
                        }],
                },
            }),
        ].join("\n") + "\n", { mode: 0o600 });
        assert.ok((0, node_fs_1.statSync)(hugePath).size
            > agent_session_producer_freshness_js_1.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1.maxTailScanBytes
                + agent_session_producer_freshness_js_1.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1.maxHeadScanBytes);
        const agentSnapshotPath = node_path_1.default.join(sourceRoot, "agent-session-producer-snapshot.v1.json");
        let graphInput;
        const nowMs = Date.parse("2026-07-30T08:00:00.000Z");
        const service = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId,
            sourcePaths: {
                agentSessionRoots: [
                    { sourceLabel: "codex", rootPath: codexRoot },
                    { sourceLabel: "claude", rootPath: claudeRoot },
                ],
                agentSessionProducerSnapshotPath: agentSnapshotPath,
            },
            collectors: {
                meeting_notes: async () => slice("meeting_notes"),
                calendar: async () => slice("calendar"),
                body: async () => slice("body"),
            },
            graphBuilder: async (input) => {
                graphInput = input.graphInput;
                return graphBuilder(ownerCandidate)();
            },
            nowMs: () => nowMs,
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published");
        const serializedSnapshot = (0, node_fs_1.readFileSync)(agentSnapshotPath, "utf8");
        assert.ok(Buffer.byteLength(serializedSnapshot, "utf8")
            <= agent_session_producer_freshness_js_1.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1.maxSnapshotBytes);
        const snapshot = JSON.parse(serializedSnapshot);
        assert.equal(snapshot.coverage, "partial");
        assert.equal(snapshot.observedCount, 3);
        assert.deepEqual(snapshot.sessions.map((session) => session.userDirectiveSummary)
            .sort(), [
            "Complete the loop",
            "Prepare the customer launch checklist",
            "Continue unrelated work",
            "Why is the current goal blocked?",
            "让这个 leaf node 先批准再 run，完成后保留 artifact；如果没有兄弟 leaf，就拆掉母节点。",
            "Prepare the old fundraising brief",
            "Review [local-path] using [credential]",
            "Session continuity",
            "Session continuity",
            "Session continuity",
        ].sort());
        const latest = [...snapshot.sessions].sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))[0];
        assert.equal(latest.userDirectiveSummary, "Prepare the customer launch checklist");
        const ordinaryDirective = snapshot.sessions.find((episode) => episode.userDirectiveSummary === "Prepare the customer launch checklist");
        const completeLoop = snapshot.sessions.find((episode) => episode.userDirectiveSummary.includes("artifact"));
        const laterSameRootStatus = snapshot.sessions.find((episode) => episode.userDirectiveSummary === "Why is the current goal blocked?");
        assert.equal(laterSameRootStatus.rootSessionIdentityDigest, completeLoop.rootSessionIdentityDigest);
        assert.ok(Date.parse(laterSameRootStatus.occurredAt)
            > Date.parse(completeLoop.occurredAt));
        assert.equal(completeLoop.assistantOutcomeSummary, "Prepared [local-path] with Bearer [credential]");
        const expectedRootIdentityDigest = (0, source_contracts_js_1.taskMapContractDigest)({
            domain: agent_session_producer_freshness_js_1.TASKMAP_AGENT_SESSION_IDENTITY_DOMAIN,
            provider: "codex",
            nativeIdentity: nativeSessionIdentity,
        });
        assert.equal(completeLoop.rootSessionIdentityDigest, expectedRootIdentityDigest);
        assert.equal(completeLoop.episodeIdentityDigest, (0, source_contracts_js_1.taskMapContractDigest)({
            domain: agent_session_producer_freshness_js_1.TASKMAP_AGENT_SESSION_EPISODE_IDENTITY_DOMAIN,
            provider: "codex",
            rootSessionIdentityDigest: expectedRootIdentityDigest,
            nativeTurnIdentity: "huge-complete-loop-turn",
            fallbackIdentity: null,
        }));
        for (const forbidden of [
            giantToolSecret,
            "/Users/private-owner",
            "/tmp/private",
            "private-secret-value",
            "private-secret-token-value",
            "Compaction summary",
            "Repeat the old task",
            "delegation noise",
            "<recommended_plugins>",
            nativeSessionIdentity,
            nativeParentIdentity,
            "head-only episode",
        ]) {
            assert.equal(serializedSnapshot.includes(forbidden), false, forbidden);
        }
        const agentSource = graphInput?.sources.find((source) => source.source === "agent_session");
        assert.equal(agentSource?.value?.recordCount, 10);
        assert.equal(agentSource?.value?.metadata.coverage, "partial");
        assert.equal(agentSource?.value?.metadata.contextOnly, true);
        const semanticAdmission = agentSource?.value?.semanticAdmission;
        assert.ok(semanticAdmission);
        const semanticClusters = semanticAdmission.clusters;
        const latestByRoot = new Map();
        for (const episode of snapshot.sessions) {
            const previous = latestByRoot.get(episode.rootSessionIdentityDigest);
            if (previous === undefined
                || Date.parse(episode.occurredAt) > Date.parse(previous.occurredAt)
                || (episode.occurredAt === previous.occurredAt
                    && episode.episodeId.localeCompare(previous.episodeId) < 0)) {
                latestByRoot.set(episode.rootSessionIdentityDigest, episode);
            }
        }
        const selectedLatest = [...latestByRoot.values()].sort((left, right) => left.episodeId.localeCompare(right.episodeId));
        assert.equal(semanticClusters.length, 3);
        assert.equal(new Set(semanticClusters.flatMap((cluster) => cluster.supports.map((support) => support.rootSessionIdentityDigest))).size, semanticClusters.length);
        assert.deepEqual(semanticClusters.map((cluster) => cluster.userDirectiveSummary).sort(), selectedLatest.map((episode) => episode.userDirectiveSummary).sort());
        const ordinaryAdmission = semanticClusters.find((cluster) => cluster.supports.some((support) => support.episodeIdentityDigest
            === ordinaryDirective.episodeIdentityDigest));
        assert.ok(ordinaryAdmission);
        assert.equal(ordinaryAdmission.userDirectiveSummary, ordinaryDirective.userDirectiveSummary);
        assert.equal(ordinaryAdmission.routingKind, "repository");
        assert.equal(ordinaryAdmission.authority, "none");
        assert.equal(JSON.stringify(agentSource?.value).includes(ordinaryDirective.userDirectiveSummary), true);
    });
    (0, node_test_1.it)("fails closed when the authenticated agent-session producer changes after the source barrier", async () => {
        const locations = roots("taskmap-native-agent-swap-");
        const ownerUserId = "synthetic-agent-swap-owner";
        const sourceRoot = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "agent-sources");
        const codexRoot = node_path_1.default.join(sourceRoot, "codex");
        (0, node_fs_1.mkdirSync)(codexRoot, { recursive: true, mode: 0o700 });
        (0, node_fs_1.writeFileSync)(node_path_1.default.join(codexRoot, "session.jsonl"), [
            JSON.stringify({
                timestamp: "2026-07-30T06:00:00.000Z",
                type: "session_meta",
                payload: { id: "swap-session-identity" },
            }),
            JSON.stringify({
                timestamp: "2026-07-30T06:01:00.000Z",
                type: "response_item",
                payload: {
                    type: "message",
                    role: "user",
                    content: [{
                            type: "input_text",
                            text: "Review the accepted Task Map route",
                        }],
                },
            }),
        ].join("\n") + "\n", { mode: 0o600 });
        const agentSnapshotPath = node_path_1.default.join(sourceRoot, "agent-session-producer-snapshot.v1.json");
        const meetingSnapshotPath = node_path_1.default.join(sourceRoot, "meeting-producer-snapshot.v1.json");
        writeMeetingProducerSnapshot(meetingSnapshotPath, {
            userId: ownerUserId,
        });
        const nowMs = Date.parse("2026-07-30T08:00:00.000Z");
        const service = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId,
            meetingProducerSnapshotPath: meetingSnapshotPath,
            sourcePaths: {
                agentSessionRoots: [
                    { sourceLabel: "codex", rootPath: codexRoot },
                ],
                agentSessionProducerSnapshotPath: agentSnapshotPath,
            },
            collectors: {
                calendar: async () => slice("calendar"),
                body: async () => {
                    for (let index = 0; index < 200; index += 1) {
                        if ((0, node_fs_1.existsSync)(agentSnapshotPath))
                            break;
                        await new Promise((resolve) => setTimeout(resolve, 1));
                    }
                    assert.equal((0, node_fs_1.existsSync)(agentSnapshotPath), true);
                    (0, node_fs_1.writeFileSync)(agentSnapshotPath, '{"swapped_after_collection":true}\n', { mode: 0o600 });
                    return slice("body");
                },
            },
            nowMs: () => nowMs,
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "unavailable");
        assert.equal(result.publicationVerified, false);
        assert.equal(result.publicationBlockReason, "semantic_provider_unavailable");
        assert.equal(result.sourceStatuses.find((status) => status.source === "agent_session")?.state, "unavailable");
        assert.equal((0, node_fs_1.existsSync)(locations.projectionPath), false);
        assert.equal((0, node_fs_1.existsSync)(locations.currentnessPath), false);
        const state = artifact(locations.runtimeRoot, "taskmap-refresh-state.v1.json");
        assert.equal(state.lastSourceStatuses.find((status) => status.source === "agent_session")?.disposition, "unavailable");
        assert.equal(Object.hasOwn(state.lastSourceSuccessAtMs, "agent_session"), false);
    });
    (0, node_test_1.it)("fails closed without advancing Meeting success when GDocs disappears after the source barrier", async () => {
        await assertMeetingBarrierRaceFailsClosed("disappears");
    });
    (0, node_test_1.it)("fails closed without advancing Meeting success when GDocs changes after the source barrier", async () => {
        await assertMeetingBarrierRaceFailsClosed("changes");
    });
    (0, node_test_1.it)("counts a current owner-receipted Granola export as Meeting context without granting semantic authority", async () => {
        const locations = roots("taskmap-native-granola-context-");
        const ownerUserId = "synthetic-granola-context-owner";
        const confirmedOwner = (0, confirmed_owner_js_1.confirmedTestOwner)(ownerUserId);
        const ownerScope = (0, owner_scope_js_1.createTaskMapOwnerScope)(confirmedOwner.userId, confirmedOwner.homeDirectory);
        const successAt = "2026-08-03T20:00:00Z";
        const successAtMs = Date.parse(successAt);
        (0, node_fs_1.mkdirSync)(ownerScope.sourceRoot, { recursive: true, mode: 0o700 });
        const granolaPath = node_path_1.default.join(ownerScope.sourceRoot, "granola-mcp-snapshot.json");
        const granolaBytes = JSON.stringify({
            events: [],
            meeting_notes: [{
                    source_ref: "granola-context-note",
                    occurred_at: "2026-08-03T19:30:00.000Z",
                    title: "MUST NOT BECOME A TASK",
                    summary: "MUST NOT ENTER THE SEMANTIC PROJECTION",
                }],
        }, null, 2);
        (0, node_fs_1.writeFileSync)(granolaPath, granolaBytes, { mode: 0o600 });
        (0, node_fs_1.utimesSync)(granolaPath, new Date(successAtMs + 3_000), new Date(successAtMs + 3_000));
        (0, node_fs_1.writeFileSync)(node_path_1.default.join(ownerScope.sourceRoot, "taskmap-resident-receipt.v1.json"), JSON.stringify({
            contractVersion: "taskmap-resident-receipt.v1",
            ownerScopeDigest: ownerScope.ownerScopeDigest,
            granola_mcp_success: successAt,
            granola_mcp_snapshot_sha256: (0, node_crypto_1.createHash)("sha256")
                .update(granolaBytes)
                .digest("hex"),
        }, null, 2), { mode: 0o600 });
        const service = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId,
            collectors: {
                agent_session: async () => admittedAgentSessionSlice("Keep the accepted owner work current", "granola-context-agent", ownerScope.ownerScopeDigest),
                calendar: async () => slice("calendar"),
                body: async () => slice("body"),
            },
            nowMs: () => successAtMs + 5 * 60 * 1_000,
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published", JSON.stringify(result));
        const meetingStatus = result.sourceStatuses.find((status) => status.source === "meeting_notes");
        assert.equal(meetingStatus?.state, "current");
        assert.equal(meetingStatus?.lastSuccessAtMs, successAtMs);
        const projectionBytes = (0, node_fs_1.readFileSync)(locations.projectionPath, "utf8");
        assert.doesNotMatch(projectionBytes, /MUST NOT/);
        const state = artifact(locations.runtimeRoot, "taskmap-refresh-state.v1.json");
        assert.equal(state.sources.meeting_notes.value.metadata.granolaCurrent, true);
        assert.equal(state.sources.meeting_notes.value.metadata.contextOnly, true);
    });
    (0, node_test_1.it)("ignores a legacy global Granola snapshot even when an owner receipt names its digest", async () => {
        const locations = roots("taskmap-native-granola-global-isolation-");
        const ownerUserId = "synthetic-granola-global-isolation-owner";
        const confirmedOwner = (0, confirmed_owner_js_1.confirmedTestOwner)(ownerUserId);
        const ownerScope = (0, owner_scope_js_1.createTaskMapOwnerScope)(confirmedOwner.userId, confirmedOwner.homeDirectory);
        const successAt = "2026-08-03T20:00:00Z";
        const successAtMs = Date.parse(successAt);
        const legacyGlobalPath = node_path_1.default.join(confirmedOwner.homeDirectory, ".daobrew", "granola-mcp-snapshot.json");
        const granolaBytes = JSON.stringify({
            events: [],
            meeting_notes: [{
                    source_ref: "wrong-global-owner-snapshot",
                    occurred_at: "2026-08-03T19:30:00.000Z",
                    title: "MUST NOT CROSS THE OWNER BOUNDARY",
                }],
        });
        (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(legacyGlobalPath), {
            recursive: true,
            mode: 0o700,
        });
        (0, node_fs_1.writeFileSync)(legacyGlobalPath, granolaBytes, { mode: 0o600 });
        (0, node_fs_1.utimesSync)(legacyGlobalPath, new Date(successAtMs), new Date(successAtMs));
        (0, node_fs_1.mkdirSync)(ownerScope.sourceRoot, { recursive: true, mode: 0o700 });
        (0, node_fs_1.writeFileSync)(node_path_1.default.join(ownerScope.sourceRoot, "taskmap-resident-receipt.v1.json"), JSON.stringify({
            contractVersion: "taskmap-resident-receipt.v1",
            ownerScopeDigest: ownerScope.ownerScopeDigest,
            granola_mcp_success: successAt,
            granola_mcp_snapshot_sha256: (0, node_crypto_1.createHash)("sha256")
                .update(granolaBytes)
                .digest("hex"),
        }), { mode: 0o600 });
        const service = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId,
            collectors: {
                agent_session: async () => admittedAgentSessionSlice("Keep the accepted owner work current", "granola-global-isolation-agent", ownerScope.ownerScopeDigest),
                calendar: async () => slice("calendar"),
                body: async () => slice("body"),
            },
            nowMs: () => successAtMs + 5 * 60 * 1_000,
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published", JSON.stringify(result));
        assert.equal(result.sourceStatuses.find((status) => status.source === "meeting_notes")?.state, "unavailable");
        assert.doesNotMatch((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8"), /MUST NOT CROSS/);
    });
    (0, node_test_1.it)("excludes wrong-owner GDocs bytes and revisions while retaining valid owner-receipted Granola context", async () => {
        const locations = roots("taskmap-native-gdocs-owner-isolation-");
        const ownerUserId = "synthetic-gdocs-owner-isolation-owner";
        const confirmedOwner = (0, confirmed_owner_js_1.confirmedTestOwner)(ownerUserId);
        const ownerScope = (0, owner_scope_js_1.createTaskMapOwnerScope)(confirmedOwner.userId, confirmedOwner.homeDirectory);
        const successAt = "2026-08-03T20:00:00Z";
        const successAtMs = Date.parse(successAt);
        let nowMs = successAtMs + 5 * 60 * 1_000;
        (0, node_fs_1.mkdirSync)(ownerScope.sourceRoot, { recursive: true, mode: 0o700 });
        const gdocsPath = node_path_1.default.join(ownerScope.sourceRoot, "meeting-producer-snapshot.v1.json");
        writeMeetingProducerSnapshot(gdocsPath, {
            userId: "different-gdocs-owner",
            producedAt: successAt,
            meetings: [meetingProducerMeeting("wrong-owner-gdocs-a", "2026-08-03T19:15:00.000Z")],
        });
        const granolaPath = node_path_1.default.join(ownerScope.sourceRoot, "granola-mcp-snapshot.json");
        const granolaBytes = JSON.stringify({
            events: [],
            meeting_notes: [{
                    source_ref: "owner-granola-note",
                    occurred_at: "2026-08-03T19:30:00.000Z",
                    title: "Owner Granola context",
                }],
        });
        (0, node_fs_1.writeFileSync)(granolaPath, granolaBytes, { mode: 0o600 });
        (0, node_fs_1.utimesSync)(granolaPath, new Date(successAtMs), new Date(successAtMs));
        (0, node_fs_1.writeFileSync)(node_path_1.default.join(ownerScope.sourceRoot, "taskmap-resident-receipt.v1.json"), JSON.stringify({
            contractVersion: "taskmap-resident-receipt.v1",
            ownerScopeDigest: ownerScope.ownerScopeDigest,
            granola_mcp_success: successAt,
            granola_mcp_snapshot_sha256: (0, node_crypto_1.createHash)("sha256")
                .update(granolaBytes)
                .digest("hex"),
        }), { mode: 0o600 });
        const serviceOptions = () => ({
            ...locations,
            ownerUserId,
            collectors: {
                agent_session: async () => admittedAgentSessionSlice("Keep the accepted owner work current", "gdocs-owner-isolation-agent", ownerScope.ownerScopeDigest),
                calendar: async () => slice("calendar"),
                body: async () => slice("body"),
            },
            nowMs: () => nowMs,
        });
        const first = new TaskMapNativeRefreshService(serviceOptions());
        const firstResult = await first.requestRefresh("manual");
        assert.equal(firstResult.refreshStatus, "published", JSON.stringify(firstResult));
        assert.equal(firstResult.sourceStatuses.find((status) => status.source === "meeting_notes")?.state, "current");
        const firstState = artifact(locations.runtimeRoot, "taskmap-refresh-state.v1.json");
        const firstMeeting = firstState.sources.meeting_notes;
        assert.equal(firstMeeting.value.metadata.availableSnapshots, 1);
        assert.equal(firstMeeting.value.metadata.gdocsAvailable, false);
        assert.equal(firstMeeting.value.metadata.granolaCurrent, true);
        assert.equal(firstMeeting.value.recordCount, 1);
        writeMeetingProducerSnapshot(gdocsPath, {
            userId: "another-different-gdocs-owner",
            producedAt: successAt,
            meetings: [
                meetingProducerMeeting("wrong-owner-gdocs-b", "2026-08-03T19:20:00.000Z"),
                meetingProducerMeeting("wrong-owner-gdocs-c", "2026-08-03T19:25:00.000Z"),
            ],
        });
        nowMs += 5 * 60 * 1_000;
        const replay = new TaskMapNativeRefreshService(serviceOptions());
        const replayResult = await replay.requestRefresh("manual");
        assert.equal(replayResult.refreshStatus, "no_op", JSON.stringify(replayResult));
        const replayState = artifact(locations.runtimeRoot, "taskmap-refresh-state.v1.json");
        const replayMeeting = replayState.sources.meeting_notes;
        assert.equal(replayMeeting.revision, firstMeeting.revision);
        assert.equal(replayMeeting.sliceDigest, firstMeeting.sliceDigest);
        assert.equal(replayMeeting.value.metadata.availableSnapshots, 1);
        assert.equal(replayMeeting.value.metadata.gdocsAvailable, false);
        assert.equal(replayMeeting.value.recordCount, 1);
    });
    (0, node_test_1.it)("does not let the legacy Granola warm-tier stamp authorize the promoted provider snapshot", async () => {
        const locations = roots("taskmap-native-granola-legacy-receipt-");
        const ownerUserId = "synthetic-granola-legacy-owner";
        const confirmedOwner = (0, confirmed_owner_js_1.confirmedTestOwner)(ownerUserId);
        const ownerScope = (0, owner_scope_js_1.createTaskMapOwnerScope)(confirmedOwner.userId, confirmedOwner.homeDirectory);
        const successAt = "2026-08-03T20:00:00Z";
        const successAtMs = Date.parse(successAt);
        (0, node_fs_1.mkdirSync)(ownerScope.sourceRoot, { recursive: true, mode: 0o700 });
        const granolaPath = node_path_1.default.join(ownerScope.sourceRoot, "granola-mcp-snapshot.json");
        (0, node_fs_1.writeFileSync)(granolaPath, JSON.stringify({
            events: [],
            meeting_notes: [],
        }), { mode: 0o600 });
        (0, node_fs_1.utimesSync)(granolaPath, new Date(successAtMs), new Date(successAtMs));
        (0, node_fs_1.writeFileSync)(node_path_1.default.join(ownerScope.sourceRoot, "taskmap-resident-receipt.v1.json"), JSON.stringify({
            contractVersion: "taskmap-resident-receipt.v1",
            ownerScopeDigest: ownerScope.ownerScopeDigest,
            granola: successAt,
        }), { mode: 0o600 });
        const service = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId,
            collectors: {
                agent_session: async () => admittedAgentSessionSlice("Keep the accepted owner work current", "granola-legacy-agent", ownerScope.ownerScopeDigest),
                calendar: async () => slice("calendar"),
                body: async () => slice("body"),
            },
            nowMs: () => successAtMs + 5 * 60 * 1_000,
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published", JSON.stringify(result));
        assert.equal(result.sourceStatuses.find((status) => status.source === "meeting_notes")?.state, "unavailable");
    });
    (0, node_test_1.it)("rejects Granola bytes that do not match the owner success receipt digest", async () => {
        const locations = roots("taskmap-native-granola-digest-swap-");
        const ownerUserId = "synthetic-granola-digest-owner";
        const confirmedOwner = (0, confirmed_owner_js_1.confirmedTestOwner)(ownerUserId);
        const ownerScope = (0, owner_scope_js_1.createTaskMapOwnerScope)(confirmedOwner.userId, confirmedOwner.homeDirectory);
        const successAt = "2026-08-03T20:00:00Z";
        const successAtMs = Date.parse(successAt);
        (0, node_fs_1.mkdirSync)(ownerScope.sourceRoot, { recursive: true, mode: 0o700 });
        const granolaPath = node_path_1.default.join(ownerScope.sourceRoot, "granola-mcp-snapshot.json");
        const replacedBytes = JSON.stringify({
            events: [],
            meeting_notes: [{ title: "unreceipted replacement" }],
        });
        (0, node_fs_1.writeFileSync)(granolaPath, replacedBytes, { mode: 0o600 });
        (0, node_fs_1.utimesSync)(granolaPath, new Date(successAtMs), new Date(successAtMs));
        (0, node_fs_1.writeFileSync)(node_path_1.default.join(ownerScope.sourceRoot, "taskmap-resident-receipt.v1.json"), JSON.stringify({
            contractVersion: "taskmap-resident-receipt.v1",
            ownerScopeDigest: ownerScope.ownerScopeDigest,
            granola_mcp_success: successAt,
            granola_mcp_snapshot_sha256: (0, node_crypto_1.createHash)("sha256")
                .update("previous accepted bytes")
                .digest("hex"),
        }), { mode: 0o600 });
        const service = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId,
            collectors: {
                agent_session: async () => admittedAgentSessionSlice("Keep the accepted owner work current", "granola-digest-agent", ownerScope.ownerScopeDigest),
                calendar: async () => slice("calendar"),
                body: async () => slice("body"),
            },
            nowMs: () => successAtMs + 5 * 60 * 1_000,
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published", JSON.stringify(result));
        assert.equal(result.sourceStatuses.find((status) => status.source === "meeting_notes")?.state, "unavailable");
    });
    (0, node_test_1.it)("accepts the native app's current owner-scoped Local Calendar export without Google", async () => {
        const locations = roots("taskmap-native-local-calendar-only-");
        const ownerUserId = "synthetic-local-calendar-owner";
        const confirmedOwner = (0, confirmed_owner_js_1.confirmedTestOwner)(ownerUserId);
        const ownerScope = (0, owner_scope_js_1.createTaskMapOwnerScope)(confirmedOwner.userId, confirmedOwner.homeDirectory);
        const producedAt = "2026-08-03T20:00:00.000Z";
        const eventIdentityDigest = (0, source_contracts_js_1.taskMapContractDigest)("native-local-calendar-event");
        const title = "Review the native refresh";
        const startAt = "2026-08-03T21:00:00.000Z";
        const endAt = "2026-08-03T21:30:00.000Z";
        const local = (0, calendar_producer_freshness_js_1.buildTaskMapLocalCalendarExport)({
            ownerScopeDigest: ownerScope.ownerScopeDigest,
            producedAt,
            events: [{
                    eventIdentityDigest,
                    crossProviderIdentityDigest: null,
                    revisionDigest: (0, calendar_producer_freshness_js_1.taskMapCalendarFieldDigest)(calendar_producer_freshness_js_1.TASKMAP_CALENDAR_EVENT_REVISION_DOMAIN, [eventIdentityDigest, title, startAt, endAt]),
                    title,
                    startAt,
                    endAt,
                }],
        });
        (0, node_fs_1.mkdirSync)(ownerScope.sourceRoot, { recursive: true, mode: 0o700 });
        (0, node_fs_1.writeFileSync)(node_path_1.default.join(ownerScope.sourceRoot, "calendar-export.json"), (0, calendar_producer_freshness_js_1.taskMapLocalCalendarExportCanonicalJson)(local), { mode: 0o600 });
        const service = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId,
            collectors: {
                agent_session: async () => slice("agent_session"),
                meeting_notes: async () => {
                    throw new Error("meeting connector unavailable");
                },
                body: async () => slice("body"),
            },
            nowMs: () => Date.parse("2026-08-03T20:05:00.000Z"),
        });
        const result = await service.requestRefresh("manual");
        const calendarExtractionPath = node_path_1.default.join(locations.runtimeRoot, "taskmap-calendar-extraction-report.v1.json");
        assert.equal((0, node_fs_1.existsSync)(calendarExtractionPath), true, JSON.stringify(result));
        const calendarExtraction = JSON.parse((0, node_fs_1.readFileSync)(calendarExtractionPath, "utf8"));
        assert.equal(calendarExtraction.pendingCount, 0);
        assert.equal(calendarExtraction.segments[0]?.mentions.length, 1);
        assert.equal(result.refreshStatus, "published", JSON.stringify(result));
        const projection = committedGeneration(locations.projectionPath).projection;
        assert.deepEqual(projection.tasks, []);
        assert.equal(result.sourceStatuses.find((status) => status.source === "calendar")?.state, "current");
        assert.deepEqual((result.calendarProviderStatuses ?? []).map((status) => [
            status.provider,
            status.state,
        ]), [
            ["local_calendar", "current"],
            ["google_calendar", "unavailable"],
        ]);
        const changedTitle = "Do not publish while extraction is unavailable";
        const changedRevision = (0, calendar_producer_freshness_js_1.taskMapCalendarFieldDigest)(calendar_producer_freshness_js_1.TASKMAP_CALENDAR_EVENT_REVISION_DOMAIN, [eventIdentityDigest, changedTitle, startAt, endAt]);
        (0, node_fs_1.writeFileSync)(node_path_1.default.join(ownerScope.sourceRoot, "calendar-export.json"), (0, calendar_producer_freshness_js_1.taskMapLocalCalendarExportCanonicalJson)((0, calendar_producer_freshness_js_1.buildTaskMapLocalCalendarExport)({
            ownerScopeDigest: ownerScope.ownerScopeDigest,
            producedAt: "2026-08-03T20:04:00.000Z",
            events: [{
                    eventIdentityDigest,
                    crossProviderIdentityDigest: null,
                    revisionDigest: changedRevision,
                    title: changedTitle,
                    startAt,
                    endAt,
                }],
        })), { mode: 0o600 });
        const degradedService = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId,
            collectors: {
                agent_session: async () => slice("agent_session"),
                meeting_notes: async () => {
                    throw new Error("meeting connector unavailable");
                },
                body: async () => slice("body"),
            },
            createCalendarExtractionStation: async () => {
                throw new llm_station_js_1.LlmStationUnavailableError("no_provider");
            },
            nowMs: () => Date.parse("2026-08-03T20:06:00.000Z"),
        });
        const degraded = await degradedService.requestRefresh("manual");
        assert.notEqual(degraded.refreshStatus, "unavailable", JSON.stringify(degraded));
        assert.deepEqual(degraded.sourceStatuses.find((status) => status.source === "calendar"), {
            source: "calendar",
            disposition: "fresh",
            stationDegradationCode: "no_provider",
            stationPendingCount: 1,
            state: "current",
            lastSuccessAtMs: Date.parse("2026-08-03T20:04:00.000Z"),
            nextDueAtMs: Date.parse("2026-08-04T00:04:00.000Z"),
            proof: "local_source_read",
        });
        assert.equal(JSON.stringify(committedGeneration(locations.projectionPath).projection)
            .includes(changedTitle), false);
    });
    (0, node_test_1.it)("collects a four-hour logical Calendar source from local and Google providers without minting task authority", async () => {
        const locations = roots("taskmap-native-calendar-providers-");
        const ownerUserId = "B8A25F07-C6ED-4E32-AC8A-6B13A43A62D1";
        const ownerScopeDigest = (0, confirmed_owner_js_1.confirmedTestOwner)(ownerUserId).ownerScopeDigest;
        const ownerCandidate = publicationCandidate(0, loaderCompatibleProjection(), ownerScopeDigest);
        const sourceRoot = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "calendar-sources");
        (0, node_fs_1.mkdirSync)(sourceRoot, { recursive: true, mode: 0o700 });
        (0, node_fs_1.chmodSync)(sourceRoot, 0o700);
        const localExportPath = node_path_1.default.join(sourceRoot, "local.json");
        const googleSnapshotPath = node_path_1.default.join(sourceRoot, "google.json");
        const producedAt = "2026-07-30T12:00:00.000Z";
        const crossProviderIdentityDigest = (0, source_contracts_js_1.taskMapContractDigest)("shared-calendar-occurrence");
        const row = (name, cross) => {
            const eventIdentityDigest = (0, source_contracts_js_1.taskMapContractDigest)(`event:${name}`);
            const title = `Synthetic ${name}`;
            const startAt = "2026-07-30T13:00:00.000Z";
            const endAt = "2026-07-30T13:30:00.000Z";
            return {
                eventIdentityDigest,
                crossProviderIdentityDigest: cross,
                revisionDigest: (0, calendar_producer_freshness_js_1.taskMapCalendarFieldDigest)(calendar_producer_freshness_js_1.TASKMAP_CALENDAR_EVENT_REVISION_DOMAIN, [eventIdentityDigest, title, startAt, endAt]),
                title,
                startAt,
                endAt,
            };
        };
        (0, node_fs_1.writeFileSync)(localExportPath, (0, calendar_producer_freshness_js_1.taskMapLocalCalendarExportCanonicalJson)((0, calendar_producer_freshness_js_1.buildTaskMapLocalCalendarExport)({
            ownerScopeDigest: (0, confirmed_owner_js_1.confirmedTestOwner)(ownerUserId).ownerScopeDigest,
            producedAt,
            events: [
                row("eventkit-google-copy", crossProviderIdentityDigest),
                row("local-only", null),
            ],
        })), { mode: 0o600 });
        (0, node_fs_1.writeFileSync)(googleSnapshotPath, (0, calendar_producer_freshness_js_1.taskMapGoogleCalendarProviderSnapshotCanonicalJson)((0, calendar_producer_freshness_js_1.buildTaskMapGoogleCalendarProviderSnapshot)({
            ownerScopeDigest: (0, confirmed_owner_js_1.confirmedTestOwner)(ownerUserId).ownerScopeDigest,
            producedAt,
            events: [
                row("direct-google", crossProviderIdentityDigest),
            ],
        })), { mode: 0o600 });
        let graphInput;
        let nowMs = Date.parse("2026-07-30T15:59:00.000Z");
        const makeService = () => new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId,
            sourcePaths: {
                calendarExportPath: localExportPath,
                googleCalendarSnapshotPath: googleSnapshotPath,
            },
            collectors: {
                agent_session: async () => slice("agent_session"),
                meeting_notes: async () => slice("meeting_notes"),
                body: async () => slice("body"),
            },
            graphBuilder: async (input) => {
                graphInput = input.graphInput;
                return graphBuilder(ownerCandidate)();
            },
            nowMs: () => nowMs,
        });
        const service = makeService();
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published");
        const calendarStatus = result.sourceStatuses.find((status) => status.source === "calendar");
        assert.equal(calendarStatus?.state, "current");
        assert.equal(calendarStatus?.lastSuccessAtMs, Date.parse(producedAt));
        assert.deepEqual(result.calendarProviderStatuses, [
            {
                provider: "local_calendar",
                state: "current",
                freshness: "current",
                lastSuccessAtMs: Date.parse(producedAt),
                nextDueAtMs: Date.parse("2026-07-30T16:00:00.000Z"),
                eventCount: 2,
            },
            {
                provider: "google_calendar",
                state: "current",
                freshness: "current",
                lastSuccessAtMs: Date.parse(producedAt),
                nextDueAtMs: Date.parse("2026-07-30T16:00:00.000Z"),
                eventCount: 1,
            },
        ]);
        const calendarSlice = graphInput?.sources.find((source) => source.source === "calendar")?.value;
        assert.equal(calendarSlice?.recordCount, 2);
        assert.equal(calendarSlice?.metadata.localProviderFreshness, "current");
        assert.equal(calendarSlice?.metadata.googleProviderFreshness, "current");
        assert.equal(calendarSlice?.metadata.contextOnly, true);
        assert.equal(calendarSlice?.metadata.boundedSemanticTitleCount, 2);
        const serialized = JSON.stringify(calendarSlice);
        assert.ok(!serialized.includes("Synthetic local-only"));
        assert.ok(!serialized.includes("eventkit-google-copy"));
        assert.ok(!serialized.includes("direct-google"));
        nowMs = Date.parse("2026-07-30T16:00:00.000Z");
        const boundary = await service.requestRefresh("manual");
        assert.deepEqual(boundary.calendarProviderStatuses?.map((row) => ({
            provider: row.provider,
            state: row.state,
            freshness: row.freshness,
        })), [
            {
                provider: "local_calendar",
                state: "retained",
                freshness: "boundary_due",
            },
            {
                provider: "google_calendar",
                state: "retained",
                freshness: "boundary_due",
            },
        ]);
        assert.equal(boundary.sourceStatuses.find((status) => status.source === "calendar")?.state, "retained");
        nowMs = Date.parse("2026-07-30T16:00:01.000Z");
        const stale = await makeService().requestRefresh("timer");
        assert.deepEqual(stale.calendarProviderStatuses, [
            {
                provider: "local_calendar",
                state: "retained",
                freshness: "stale",
                lastSuccessAtMs: Date.parse(producedAt),
                nextDueAtMs: Date.parse("2026-07-30T16:00:00.000Z"),
                eventCount: 2,
            },
            {
                provider: "google_calendar",
                state: "retained",
                freshness: "stale",
                lastSuccessAtMs: Date.parse(producedAt),
                nextDueAtMs: Date.parse("2026-07-30T16:00:00.000Z"),
                eventCount: 1,
            },
        ]);
    });
    (0, node_test_1.it)("retains Strategy predecessor state as unavailable instead of republishing stale coverage", async () => {
        const fixture = await strategyFallbackFixture("taskmap-native-strategy-fallback-");
        const service = new TaskMapNativeRefreshService({
            ...fixture.locations,
            collectors: collectors(),
            strategyFallback: {
                homeDirectory: fixture.homeDirectory,
                readAdapterInput: fixture.readAdapterInput,
            },
            nowMs: () => Date.parse("2026-07-29T19:00:00.000Z"),
        });
        const first = await service.requestRefresh("manual");
        const second = await service.requestRefresh("manual");
        assert.equal(first.refreshStatus, "unavailable");
        assert.equal(first.publicationVerified, false);
        assert.equal(first.publicationBlockReason, "predecessor_continuity_required");
        assert.equal(second.refreshStatus, "unavailable");
        assert.equal(second.publicationVerified, false);
        assert.equal(second.publicationBlockReason, "predecessor_continuity_required");
        assert.equal((0, node_fs_1.existsSync)((0, native_refresh_service_js_1.nativeTaskRankingPath)(fixture.locations.projectionPath)), true);
        const strategyEvidencePath = node_path_1.default.join(node_path_1.default.dirname(fixture.locations.projectionPath), strategy_source_adapter_js_1.TASKMAP_STRATEGY_SOURCE_EVIDENCE_FILENAME);
        const strategyEvidence = (0, source_contracts_js_1.assertTaskMapSourceSnapshot)(JSON.parse((0, node_fs_1.readFileSync)(strategyEvidencePath, "utf8")));
        assert.equal(strategyEvidence.envelopes.length, 1);
        assert.equal(strategyEvidence.envelopes[0].sourceKind, "strategy");
        const projection = JSON.parse((0, node_fs_1.readFileSync)(fixture.locations.projectionPath, "utf8"));
        assert.equal(projection.tasks.length, 1);
        assert.ok(projection.roots.every((root) => root.causalGrade === "C0_NO_DATA"
            || root.causalGrade === "C1_CORRELATION"));
    });
    (0, node_test_1.it)("does not publish a body assessment through the retired Strategy fallback", async () => {
        const fixture = await strategyFallbackFixture("taskmap-native-strategy-body-assessment-");
        const projectionBefore = (0, node_fs_1.readFileSync)(fixture.locations.projectionPath);
        const currentnessBefore = (0, node_fs_1.readFileSync)(fixture.locations.currentnessPath);
        const physiologicalSnapshotPath = node_path_1.default.join(node_path_1.default.dirname(fixture.locations.runtimeRoot), "private", "taskmap-physiological-source-snapshot.v1.json");
        const bodyAssessmentPath = node_path_1.default.join(node_path_1.default.dirname(fixture.locations.projectionPath), native_refresh_service_js_1.TASKMAP_BODY_SIGNAL_ASSESSMENT_FILENAME);
        const nowMs = Date.parse("2026-07-29T19:00:00.000Z");
        let failProvider = false;
        let providerReads = 0;
        const service = new TaskMapNativeRefreshService({
            ...fixture.locations,
            sourcePaths: { physiologicalSnapshotPath },
            collectors: {
                agent_session: async () => slice("agent_session"),
                meeting_notes: async () => slice("meeting_notes"),
                calendar: async () => slice("calendar"),
            },
            readPhysiologicalProviderContext: async (options) => {
                providerReads += 1;
                if (failProvider)
                    throw new Error("provider unavailable");
                return classifiedLiveOuraContext(options, 60);
            },
            strategyFallback: {
                homeDirectory: fixture.homeDirectory,
                readAdapterInput: fixture.readAdapterInput,
            },
            nowMs: () => nowMs,
        });
        const first = await service.requestRefresh("manual");
        assert.equal(first.refreshStatus, "unavailable");
        assert.equal(first.publicationVerified, false);
        assert.equal(first.publicationBlockReason, "predecessor_continuity_required");
        assert.equal((0, node_fs_1.existsSync)(bodyAssessmentPath), false);
        assert.deepEqual((0, node_fs_1.readFileSync)(fixture.locations.projectionPath), projectionBefore);
        assert.deepEqual((0, node_fs_1.readFileSync)(fixture.locations.currentnessPath), currentnessBefore);
        failProvider = true;
        const second = await service.requestRefresh("manual");
        assert.equal(second.refreshStatus, "unavailable");
        assert.equal(second.publicationVerified, false);
        assert.equal(second.publicationBlockReason, "predecessor_continuity_required");
        assert.equal(providerReads, 2);
        assert.equal(second.sourceStatuses.find((status) => status.source === "body")
            ?.state, "retained");
        assert.equal((0, node_fs_1.existsSync)(bodyAssessmentPath), false);
        assert.deepEqual((0, node_fs_1.readFileSync)(fixture.locations.projectionPath), projectionBefore);
        assert.deepEqual((0, node_fs_1.readFileSync)(fixture.locations.currentnessPath), currentnessBefore);
    });
    (0, node_test_1.it)("does not republish body-informed Strategy work without four-family ranking coverage", async () => {
        const fixture = await strategyFallbackFixture("taskmap-native-strategy-body-informed-", { bodyInformedReady: true });
        const projectionBefore = (0, node_fs_1.readFileSync)(fixture.locations.projectionPath);
        const currentnessBefore = (0, node_fs_1.readFileSync)(fixture.locations.currentnessPath);
        const physiologicalSnapshotPath = node_path_1.default.join(node_path_1.default.dirname(fixture.locations.runtimeRoot), "private", "taskmap-physiological-source-snapshot.v1.json");
        const service = new TaskMapNativeRefreshService({
            ...fixture.locations,
            sourcePaths: { physiologicalSnapshotPath },
            collectors: {
                agent_session: async () => slice("agent_session"),
                meeting_notes: async () => slice("meeting_notes"),
                calendar: async () => slice("calendar"),
            },
            readPhysiologicalProviderContext: oneDayBodyInformedLiveOuraContext,
            strategyFallback: {
                homeDirectory: fixture.homeDirectory,
                readAdapterInput: fixture.readAdapterInput,
            },
            nowMs: () => Date.parse("2026-07-29T19:00:00.000Z"),
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "unavailable");
        assert.equal(result.publicationVerified, false);
        assert.equal(result.publicationBlockReason, "predecessor_continuity_required");
        assert.deepEqual((0, node_fs_1.readFileSync)(fixture.locations.projectionPath), projectionBefore);
        assert.deepEqual((0, node_fs_1.readFileSync)(fixture.locations.currentnessPath), currentnessBefore);
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(node_path_1.default.dirname(fixture.locations.projectionPath), native_refresh_service_js_1.TASKMAP_BODY_SIGNAL_ASSESSMENT_FILENAME)), false);
    });
    (0, node_test_1.it)("keeps an accepted assessment baseline eligible when only non-published task identities churn", async () => {
        const fixture = await strategyFallbackFixture("taskmap-native-strategy-body-task-identity-", {
            currentStrategyCount: 2,
            reviewStrategyCount: 2,
        });
        const fixed = JSON.parse((0, node_fs_1.readFileSync)(fixture.locations.projectionPath, "utf8"));
        const baseline = structuredClone(fixed);
        const originalTask = baseline.tasks[0];
        const replacementTaskId = "tmc_assessment_only_identity";
        originalTask.id = replacementTaskId;
        for (const root of baseline.roots) {
            root.taskIds = root.taskIds.map((taskId) => taskId === fixed.tasks[0].id ? replacementTaskId : taskId);
        }
        for (const edge of baseline.edges) {
            if (edge.from === fixed.tasks[0].id)
                edge.from = replacementTaskId;
            if (edge.to === fixed.tasks[0].id)
                edge.to = replacementTaskId;
        }
        assert.notEqual(baseline.tasks[0].id, fixed.tasks[0].id);
        assert.equal((0, native_refresh_service_js_1.taskMapBodyAssessmentPreservesAcceptedMembership)(baseline, fixed), true);
        baseline.tasks[0].title = "Different accepted work";
        assert.equal((0, native_refresh_service_js_1.taskMapBodyAssessmentPreservesAcceptedMembership)(baseline, fixed), false);
    });
    (0, node_test_1.it)("does not reassess a Strategy predecessor as a new successful publication after restart", async () => {
        const fixture = await strategyFallbackFixture("taskmap-native-strategy-body-restart-");
        const physiologicalSnapshotPath = node_path_1.default.join(node_path_1.default.dirname(fixture.locations.runtimeRoot), "private", "taskmap-physiological-source-snapshot.v1.json");
        const now = "2026-07-29T19:00:00.000Z";
        const options = {
            startDate: "2026-05-01",
            endDate: "2026-07-29",
            now: new Date(now),
        };
        const snapshot = (0, physiological_source_snapshot_js_1.buildTaskMapPhysiologicalSourceSnapshot)(await classifiedLiveOuraContext(options, 60), TEST_OWNER_SCOPE.ownerScopeDigest, now, now);
        (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(physiologicalSnapshotPath), {
            recursive: true,
            mode: 0o700,
        });
        (0, node_fs_1.writeFileSync)(physiologicalSnapshotPath, (0, physiological_source_snapshot_js_1.serializeTaskMapPhysiologicalSourceSnapshot)(snapshot), { mode: 0o600 });
        const projectionBefore = (0, node_fs_1.readFileSync)(fixture.locations.projectionPath);
        const currentnessBefore = (0, node_fs_1.readFileSync)(fixture.locations.currentnessPath);
        const snapshotBefore = (0, node_fs_1.readFileSync)(physiologicalSnapshotPath);
        let providerReads = 0;
        const service = new TaskMapNativeRefreshService({
            ...fixture.locations,
            sourcePaths: { physiologicalSnapshotPath },
            collectors: {
                agent_session: async () => slice("agent_session"),
                meeting_notes: async () => slice("meeting_notes"),
                calendar: async () => slice("calendar"),
            },
            readPhysiologicalProviderContext: async () => {
                providerReads += 1;
                throw new Error("fresh snapshot should be reused");
            },
            strategyFallback: {
                homeDirectory: fixture.homeDirectory,
                readAdapterInput: fixture.readAdapterInput,
            },
            nowMs: () => Date.parse(now),
        });
        const result = await service.requestRefresh("launch");
        assert.equal(result.refreshStatus, "unavailable");
        assert.equal(result.publicationVerified, false);
        assert.equal(providerReads, 0);
        assert.equal(result.publicationBlockReason, "predecessor_continuity_required");
        assert.deepEqual((0, node_fs_1.readFileSync)(fixture.locations.projectionPath), projectionBefore);
        assert.deepEqual((0, node_fs_1.readFileSync)(fixture.locations.currentnessPath), currentnessBefore);
        assert.deepEqual((0, node_fs_1.readFileSync)(physiologicalSnapshotPath), snapshotBefore);
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(node_path_1.default.dirname(fixture.locations.projectionPath), native_refresh_service_js_1.TASKMAP_BODY_SIGNAL_ASSESSMENT_FILENAME)), false);
    });
    (0, node_test_1.it)("does not publish repeated-pattern labels through the retired Strategy fallback", async () => {
        const fixture = await strategyFallbackFixture("taskmap-native-strategy-body-repeat-", { bodyPatternReady: true });
        const projectionBefore = (0, node_fs_1.readFileSync)(fixture.locations.projectionPath);
        const currentnessBefore = (0, node_fs_1.readFileSync)(fixture.locations.currentnessPath);
        const physiologicalSnapshotPath = node_path_1.default.join(node_path_1.default.dirname(fixture.locations.runtimeRoot), "private", "taskmap-physiological-source-snapshot.v1.json");
        const service = new TaskMapNativeRefreshService({
            ...fixture.locations,
            sourcePaths: { physiologicalSnapshotPath },
            collectors: {
                agent_session: async () => slice("agent_session"),
                meeting_notes: async () => slice("meeting_notes"),
                calendar: async () => slice("calendar"),
            },
            readPhysiologicalProviderContext: repeatedPatternLiveOuraContext,
            strategyFallback: {
                homeDirectory: fixture.homeDirectory,
                readAdapterInput: fixture.readAdapterInput,
            },
            nowMs: () => Date.parse("2026-07-29T19:00:00.000Z"),
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "unavailable");
        assert.equal(result.publicationVerified, false);
        assert.equal(result.publicationBlockReason, "predecessor_continuity_required");
        assert.deepEqual((0, node_fs_1.readFileSync)(fixture.locations.projectionPath), projectionBefore);
        assert.deepEqual((0, node_fs_1.readFileSync)(fixture.locations.currentnessPath), currentnessBefore);
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(node_path_1.default.dirname(fixture.locations.projectionPath), native_refresh_service_js_1.TASKMAP_BODY_SIGNAL_ASSESSMENT_FILENAME)), false);
    });
    (0, node_test_1.it)("retains a mixed Strategy predecessor instead of attesting it as newly current", async () => {
        const fixture = await strategyFallbackFixture("taskmap-native-strategy-owner-shape-", {
            currentStrategyCount: 9,
            reviewStrategyCount: 13,
            currentOtherCount: 4,
            reviewOtherCount: 5,
            legacyStrategyEventCount: 4,
        });
        const projectionBytesBefore = (0, node_fs_1.readFileSync)(fixture.locations.projectionPath);
        const currentnessBytesBefore = (0, node_fs_1.readFileSync)(fixture.locations.currentnessPath);
        const projectionBefore = JSON.parse(projectionBytesBefore.toString("utf8"));
        const currentnessBefore = JSON.parse(currentnessBytesBefore.toString("utf8"));
        assert.equal(projectionBefore.tasks.length, 31);
        assert.equal(currentnessBefore.taskDispositions.filter((row) => row.disposition === "current").length, 13);
        assert.equal(currentnessBefore.taskDispositions.filter((row) => row.disposition === "needs_lifecycle_review").length, 18);
        // This fixture isolates the authenticated projection/currentness pair.
        // Bound current-work successor continuity is covered independently.
        (0, node_fs_1.rmSync)(currentWorkPath(fixture.locations.projectionPath));
        const [freshStrategy, predecessor] = await Promise.all([
            fixture.readAdapterInput().then((input) => (0, strategy_source_adapter_js_1.readTaskMapStrategySourceAdapter)(input)),
            (0, native_predecessor_evidence_js_1.loadTaskMapNativePredecessorEvidence)({
                homeDirectory: fixture.homeDirectory,
            }),
        ]);
        assert.equal(predecessor.taskMapInput.pointers.filter((pointer) => pointer.sourceKind === "strategy").length, 22);
        assert.equal(freshStrategy.taskMapInput.pointers.length, 9);
        assert.equal(freshStrategy.taskMapInput.events.length, 9);
        assert.equal(freshStrategy.exactProvenance.tasks.length, 9);
        assert.equal(freshStrategy.exactProvenance.projection.runId, predecessor.binding.runId);
        assert.equal(freshStrategy.exactProvenance.projection.projectionFileDigest, predecessor.binding.projectionFileDigest);
        assert.equal(freshStrategy.exactProvenance.projection.currentnessFileDigest, predecessor.binding.currentnessFileDigest);
        const currentIds = new Set(currentnessBefore.taskDispositions
            .filter((row) => row.disposition === "current")
            .map((row) => row.taskId));
        const sourceById = new Map(projectionBefore.sources.map((source) => [source.id, source]));
        assert.equal(new Set(projectionBefore.tasks
            .filter((task) => currentIds.has(task.id))
            .map((task) => task.taskHomePointerId)
            .filter((pointerId) => pointerId !== undefined
            && sourceById.get(pointerId)?.sourceKind === "strategy")).size, 9);
        const dispositionByTask = new Map(currentnessBefore.taskDispositions.map((row) => [
            row.taskId,
            row.disposition,
        ]));
        assert.deepEqual(currentnessBefore.taskDispositions, projectionBefore.tasks.map((task) => ({
            taskId: task.id,
            disposition: dispositionByTask.get(task.id),
        })).sort((left, right) => left.taskId.localeCompare(right.taskId)));
        const predecessorPointerById = new Map(predecessor.taskMapInput.pointers.map((pointer) => [
            pointer.id,
            pointer,
        ]));
        const predecessorEventById = new Map(predecessor.taskMapInput.events.map((event) => [event.id, event]));
        for (const pointer of freshStrategy.taskMapInput.pointers) {
            const prior = predecessorPointerById.get(pointer.id);
            assert.ok(prior);
            assert.equal(pointer.sourceRefHash, prior.sourceRefHash);
            assert.equal(pointer.canonicalUrl, prior.canonicalUrl);
            assert.equal(prior.sourceVersion, freshStrategy.exactProvenance.repository.revision);
            assert.equal(pointer.authority, prior.authority);
            assert.equal(pointer.syncMode, prior.syncMode);
            assert.deepEqual([...pointer.capabilities].sort(), [...prior.capabilities].sort());
        }
        for (const event of freshStrategy.taskMapInput.events) {
            const prior = predecessorEventById.get(event.id);
            assert.ok(prior);
            assert.equal(event.pointerId, prior.pointerId);
            assert.equal(event.occurredAt, prior.occurredAt);
            assert.equal(event.title, prior.title);
            assert.equal(event.extractionConfidence, prior.extractionConfidence);
            assert.equal(event.sourceStatus, prior.sourceStatus);
        }
        const projectedTaskById = new Map(projectionBefore.tasks.map((task) => [task.id, task]));
        for (const proof of freshStrategy.exactProvenance.tasks) {
            const task = projectedTaskById.get(proof.taskId);
            assert.ok(task);
            assert.equal(task.rootId, proof.rootId);
            assert.equal(task.taskHomePointerId, proof.pointerId);
            assert.ok(task.citations.some((citation) => citation.eventId === proof.eventId
                && citation.pointerId === proof.pointerId));
        }
        let publisherCalls = 0;
        const service = new TaskMapNativeRefreshService({
            ...fixture.locations,
            collectors: collectors(),
            strategyFallback: {
                homeDirectory: fixture.homeDirectory,
                readAdapterInput: fixture.readAdapterInput,
            },
            publisher: async (input) => {
                publisherCalls += 1;
                assert.deepEqual((0, node_fs_1.readFileSync)(fixture.locations.projectionPath), projectionBytesBefore);
                assert.deepEqual((0, node_fs_1.readFileSync)(fixture.locations.currentnessPath), currentnessBytesBefore);
                const candidate = input.candidate;
                assert.deepEqual(candidate.projection, projectionBefore);
                assert.deepEqual(candidate.currentness, currentnessBefore);
                return (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(fixture.locations.projectionPath, fixture.locations.currentnessPath, node_path_1.default.join(fixture.locations.runtimeRoot, "taskmap-publication-journal.v1.json"), input);
            },
            nowMs: () => Date.parse("2026-07-29T19:00:00.000Z"),
        });
        const first = await service.requestRefresh("manual");
        const second = await service.requestRefresh("manual");
        assert.equal(first.refreshStatus, "unavailable");
        assert.equal(first.publicationVerified, false);
        assert.equal(second.refreshStatus, "unavailable");
        assert.equal(second.publicationVerified, false);
        assert.equal(publisherCalls, 0);
        assert.deepEqual(JSON.parse((0, node_fs_1.readFileSync)(fixture.locations.projectionPath, "utf8")), projectionBefore);
        assert.deepEqual(JSON.parse((0, node_fs_1.readFileSync)(fixture.locations.currentnessPath, "utf8")), currentnessBefore);
    });
    (0, node_test_1.it)("fails closed before any Strategy no-op publication or companion race", async () => {
        const fixture = await strategyFallbackFixture("taskmap-native-strategy-no-op-pair-race-", {
            currentStrategyCount: 9,
            reviewStrategyCount: 13,
            currentOtherCount: 4,
            reviewOtherCount: 5,
            legacyStrategyEventCount: 4,
        });
        (0, node_fs_1.rmSync)(currentWorkPath(fixture.locations.projectionPath));
        const projectionBefore = (0, node_fs_1.readFileSync)(fixture.locations.projectionPath);
        const currentnessBefore = (0, node_fs_1.readFileSync)(fixture.locations.currentnessPath);
        const baseline = new TaskMapNativeRefreshService({
            ...fixture.locations,
            collectors: collectors(),
            strategyFallback: {
                homeDirectory: fixture.homeDirectory,
                readAdapterInput: fixture.readAdapterInput,
            },
            nowMs: () => Date.parse("2026-07-29T19:00:00.000Z"),
        });
        assert.equal((await baseline.requestRefresh("manual")).refreshStatus, "unavailable");
        assert.deepEqual((0, node_fs_1.readFileSync)(fixture.locations.projectionPath), projectionBefore);
        assert.deepEqual((0, node_fs_1.readFileSync)(fixture.locations.currentnessPath), currentnessBefore);
        let adapterReads = 0;
        let rewrittenCurrentness = null;
        const raced = new TaskMapNativeRefreshService({
            ...fixture.locations,
            collectors: collectors(),
            strategyFallback: {
                homeDirectory: fixture.homeDirectory,
                readAdapterInput: async () => {
                    adapterReads += 1;
                    const authenticated = await fixture.readAdapterInput();
                    if (adapterReads === 2) {
                        const currentness = JSON.parse(currentnessBefore.toString("utf8"));
                        const reviewRow = currentness.taskDispositions.find((row) => row.disposition === "needs_lifecycle_review");
                        assert.ok(reviewRow);
                        reviewRow.disposition = "current";
                        (0, node_fs_1.writeFileSync)(fixture.locations.currentnessPath, `${JSON.stringify(currentness, null, 2)}\n`, { mode: 0o600 });
                        rewrittenCurrentness = (0, node_fs_1.readFileSync)(fixture.locations.currentnessPath);
                    }
                    return authenticated;
                },
            },
            nowMs: () => Date.parse("2026-07-29T19:01:00.000Z"),
        });
        const result = await raced.requestRefresh("manual");
        assert.equal(adapterReads, 1);
        assert.equal(result.refreshStatus, "unavailable");
        assert.equal(result.publicationVerified, false);
        assert.equal(result.publicationBlockReason, "predecessor_continuity_required");
        assert.deepEqual((0, node_fs_1.readFileSync)(fixture.locations.projectionPath), projectionBefore);
        assert.equal(rewrittenCurrentness, null);
        assert.deepEqual((0, node_fs_1.readFileSync)(fixture.locations.currentnessPath), currentnessBefore);
    });
    (0, node_test_1.it)("fails closed on a valid fixed-currentness rewrite outside the authenticated predecessor pair", async () => {
        const fixture = await strategyFallbackFixture("taskmap-native-strategy-currentness-swap-", {
            currentStrategyCount: 2,
            reviewStrategyCount: 1,
        });
        const projectionBefore = (0, node_fs_1.readFileSync)(fixture.locations.projectionPath);
        const currentness = JSON.parse((0, node_fs_1.readFileSync)(fixture.locations.currentnessPath, "utf8"));
        const reviewRow = currentness.taskDispositions.find((row) => row.disposition === "needs_lifecycle_review");
        assert.ok(reviewRow);
        reviewRow.disposition = "current";
        (0, node_fs_1.writeFileSync)(fixture.locations.currentnessPath, `${JSON.stringify(currentness, null, 2)}\n`, { mode: 0o600 });
        const rewrittenCurrentness = (0, node_fs_1.readFileSync)(fixture.locations.currentnessPath);
        const service = new TaskMapNativeRefreshService({
            ...fixture.locations,
            collectors: collectors(),
            strategyFallback: {
                homeDirectory: fixture.homeDirectory,
                readAdapterInput: fixture.readAdapterInput,
            },
            nowMs: () => Date.parse("2026-07-29T19:00:00.000Z"),
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "unavailable");
        assert.equal(result.publicationVerified, false);
        assert.equal(result.publicationBlockReason, "predecessor_continuity_required");
        assert.deepEqual((0, node_fs_1.readFileSync)(fixture.locations.projectionPath), projectionBefore);
        assert.deepEqual((0, node_fs_1.readFileSync)(fixture.locations.currentnessPath), rewrittenCurrentness);
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(fixture.locations.runtimeRoot, "taskmap-refresh-candidate.v1.json")), false);
    });
    (0, node_test_1.it)("fails closed when Strategy evidence does not match the fixed predecessor", async () => {
        const fixture = await strategyFallbackFixture("taskmap-native-strategy-mismatch-");
        const projectionBefore = (0, node_fs_1.readFileSync)(fixture.locations.projectionPath);
        const currentnessBefore = (0, node_fs_1.readFileSync)(fixture.locations.currentnessPath);
        const service = new TaskMapNativeRefreshService({
            ...fixture.locations,
            collectors: collectors(),
            strategyFallback: {
                homeDirectory: fixture.homeDirectory,
                readAdapterInput: async () => ({
                    ...(await fixture.readAdapterInput()),
                    expectedProjectionFileDigest: "f".repeat(64),
                }),
            },
            nowMs: () => Date.parse("2026-07-29T19:00:00.000Z"),
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "unavailable");
        assert.equal(result.publicationVerified, false);
        assert.equal(result.publicationBlockReason, "predecessor_continuity_required");
        assert.deepEqual((0, node_fs_1.readFileSync)(fixture.locations.projectionPath), projectionBefore);
        assert.deepEqual((0, node_fs_1.readFileSync)(fixture.locations.currentnessPath), currentnessBefore);
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(fixture.locations.runtimeRoot, "taskmap-refresh-candidate.v1.json")), false);
    });
    (0, node_test_1.it)("fails closed without a semantic builder and preserves fixed last-good bytes", async () => {
        const locations = roots("taskmap-native-blocked-");
        (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(locations.projectionPath), { mode: 0o700 });
        (0, node_fs_1.writeFileSync)(locations.projectionPath, "{\"keep\":\"last-good\"}\n", { mode: 0o600 });
        const service = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            nowMs: () => 1_000,
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.status, "partial");
        assert.equal(result.refreshStatus, "unavailable");
        assert.equal(result.publicationVerified, false);
        assert.equal(result.publicationBlockReason, "semantic_provider_unavailable");
        assert.equal(result.nextDueAtMs, 1_000);
        assert.deepEqual(result.sourceStatuses.map((item) => item.source), owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES);
        assert.equal((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8"), "{\"keep\":\"last-good\"}\n");
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(locations.runtimeRoot, "taskmap-refresh-candidate.v1.json")), false);
        const state = artifact(locations.runtimeRoot, "taskmap-refresh-state.v1.json");
        const status = artifact(locations.runtimeRoot, "taskmap-refresh-status.v1.json");
        assert.equal(state.contractVersion, native_refresh_service_js_1.TASKMAP_NATIVE_REFRESH_STATE_VERSION);
        assert.deepEqual(state.sources, {});
        assert.equal(status.contractVersion, native_refresh_service_js_1.TASKMAP_NATIVE_REFRESH_STATUS_VERSION);
        assert.equal(status.failureStage, "graph_builder");
        assert.equal(status.publicationBlockReason, "semantic_provider_unavailable");
        assert.equal((0, node_fs_1.statSync)(locations.runtimeRoot).mode & 0o777, 0o700);
    });
    (0, node_test_1.it)("reports a direct Oura receipt before semantic failure and retains it after provider failure", async () => {
        const locations = roots("taskmap-native-direct-oura-");
        (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(locations.projectionPath), { mode: 0o700 });
        (0, node_fs_1.writeFileSync)(locations.projectionPath, "{\"keep\":\"last-good\"}\n", { mode: 0o600 });
        const projectionBefore = (0, node_fs_1.readFileSync)(locations.projectionPath);
        const physiologicalSnapshotPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "private", "taskmap-physiological-source-snapshot.v1.json");
        const firstAtMs = Date.parse("2026-07-29T12:00:00.000Z");
        let providerReads = 0;
        const nonBodyCollectors = {
            agent_session: async () => slice("agent_session"),
            meeting_notes: async () => slice("meeting_notes"),
            calendar: async () => slice("calendar"),
        };
        const first = new TaskMapNativeRefreshService({
            ...locations,
            sourcePaths: { physiologicalSnapshotPath },
            collectors: nonBodyCollectors,
            graphBuilder: async () => {
                throw new Error("semantic provider unavailable");
            },
            readPhysiologicalProviderContext: async (options) => {
                providerReads += 1;
                return emptyLiveOuraContext(options);
            },
            nowMs: () => firstAtMs,
        });
        const firstResult = await first.requestRefresh("manual");
        assert.equal(firstResult.refreshStatus, "unavailable");
        assert.equal(firstResult.publicationBlockReason, "semantic_provider_unavailable");
        assert.equal(providerReads, 1);
        const firstBody = firstResult.sourceStatuses.find((status) => status.source === "body");
        assert.deepEqual(firstBody, {
            source: "body",
            disposition: "fresh",
            state: "current",
            lastSuccessAtMs: firstAtMs,
            nextDueAtMs: firstAtMs + owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS,
            proof: "live_provider_read",
        });
        assert.equal(firstResult.sourceStatuses.find((status) => status.source === "agent_session")?.state, "current");
        assert.equal((0, node_fs_1.statSync)(physiologicalSnapshotPath).mode & 0o777, 0o600);
        const receiptBefore = (0, node_fs_1.readFileSync)(physiologicalSnapshotPath);
        assert.deepEqual((0, node_fs_1.readFileSync)(locations.projectionPath), projectionBefore);
        const secondAtMs = firstAtMs + 60 * 60 * 1_000;
        const second = new TaskMapNativeRefreshService({
            ...locations,
            sourcePaths: { physiologicalSnapshotPath },
            collectors: nonBodyCollectors,
            graphBuilder: async () => {
                throw new Error("semantic provider unavailable");
            },
            readPhysiologicalProviderContext: async () => {
                providerReads += 1;
                throw new Error("Oura unavailable");
            },
            nowMs: () => secondAtMs,
        });
        const secondResult = await second.requestRefresh("manual");
        assert.equal(secondResult.refreshStatus, "unavailable");
        assert.equal(providerReads, 2);
        assert.deepEqual(secondResult.sourceStatuses.find((status) => status.source === "body"), {
            source: "body",
            disposition: "unavailable",
            state: "retained",
            lastSuccessAtMs: firstAtMs,
            nextDueAtMs: firstAtMs + owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS,
            proof: "live_provider_read",
        });
        assert.deepEqual((0, node_fs_1.readFileSync)(physiologicalSnapshotPath), receiptBefore);
        assert.deepEqual((0, node_fs_1.readFileSync)(locations.projectionPath), projectionBefore);
        const retainedState = artifact(locations.runtimeRoot, "taskmap-refresh-state.v1.json");
        assert.equal(retainedState.lastSourceSuccessAtMs.body, firstAtMs);
    });
    (0, node_test_1.it)("wires the barrier-bound physiological snapshot into the default projection and rejects a mismatched snapshot", async () => {
        const now = "2026-07-29T13:00:00.000Z";
        const nowMs = Date.parse(now);
        const locations = roots("taskmap-native-body-semantic-");
        const snapshotPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "meeting-producer-snapshot.v1.json");
        const physiologicalSnapshotPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "private", "taskmap-physiological-source-snapshot.v1.json");
        const userId = "owner-body-semantic-test";
        writeMeetingProducerSnapshot(snapshotPath, {
            userId,
            meetings: [
                meetingProducerMeeting("body-overlap-previous-document", "2026-07-27T09:00:00.000Z", "complete"),
                meetingProducerMeeting("body-overlap-document", "2026-07-28T09:00:00.000Z", "complete"),
            ],
        });
        const service = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId: userId,
            meetingProducerSnapshotPath: snapshotPath,
            sourcePaths: { physiologicalSnapshotPath },
            collectors: {
                agent_session: async () => slice("agent_session"),
                calendar: async () => slice("calendar"),
            },
            readPhysiologicalProviderContext: (options) => classifiedLiveOuraContext(options, 60),
            nowMs: () => nowMs,
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published");
        assert.equal(result.publicationVerified, true);
        const projection = JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8"));
        assert.equal(projection.roots.length, 1);
        assert.equal(projection.roots[0].bodyContextCount, 1);
        assert.equal(projection.tasks[0].bodyContextCount, 1);
        assert.equal(projection.roots[0].scoreBreakdown.bodyBonus, 0);
        const mismatched = roots("taskmap-native-body-mismatch-");
        const mismatchMeetingPath = node_path_1.default.join(node_path_1.default.dirname(mismatched.runtimeRoot), "meeting-producer-snapshot.v1.json");
        const mismatchBodyPath = node_path_1.default.join(node_path_1.default.dirname(mismatched.runtimeRoot), "private", "taskmap-physiological-source-snapshot.v1.json");
        writeMeetingProducerSnapshot(mismatchMeetingPath, {
            userId,
            meetings: [
                meetingProducerMeeting("body-mismatch-previous-document", "2026-07-27T09:00:00.000Z", "complete"),
                meetingProducerMeeting("body-mismatch-document", "2026-07-28T09:00:00.000Z", "complete"),
            ],
        });
        const contextOptions = {
            startDate: "2026-05-01",
            endDate: "2026-07-29",
            now: new Date(now),
        };
        const snapshotA = (0, physiological_source_snapshot_js_1.buildTaskMapPhysiologicalSourceSnapshot)(await classifiedLiveOuraContext(contextOptions, 60), (0, confirmed_owner_js_1.confirmedTestOwner)(userId).ownerScopeDigest, now, now);
        const snapshotB = (0, physiological_source_snapshot_js_1.buildTaskMapPhysiologicalSourceSnapshot)(await classifiedLiveOuraContext(contextOptions, 95), (0, confirmed_owner_js_1.confirmedTestOwner)(userId).ownerScopeDigest, now, now);
        (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(mismatchBodyPath), {
            recursive: true,
            mode: 0o700,
        });
        (0, node_fs_1.writeFileSync)(mismatchBodyPath, (0, physiological_source_snapshot_js_1.serializeTaskMapPhysiologicalSourceSnapshot)(snapshotB), { mode: 0o600 });
        const mismatchedService = new TaskMapNativeRefreshService({
            ...mismatched,
            ownerUserId: userId,
            meetingProducerSnapshotPath: mismatchMeetingPath,
            sourcePaths: { physiologicalSnapshotPath: mismatchBodyPath },
            collectors: {
                agent_session: async () => slice("agent_session"),
                calendar: async () => slice("calendar"),
                body: async () => (0, physiological_source_snapshot_js_1.buildTaskMapPhysiologicalOwnerSlice)(snapshotA, now, (0, confirmed_owner_js_1.confirmedTestOwner)(userId).ownerScopeDigest),
            },
            nowMs: () => nowMs,
        });
        const mismatchResult = await mismatchedService.requestRefresh("manual");
        assert.equal(mismatchResult.refreshStatus, "unavailable");
        assert.equal(mismatchResult.publicationBlockReason, "semantic_provider_unavailable");
        assert.equal((0, node_fs_1.existsSync)(mismatched.projectionPath), false);
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(mismatched.runtimeRoot, "taskmap-refresh-candidate.v1.json")), false);
    });
    (0, node_test_1.it)("uses the authenticated default producer, proposes review-only work, and replays as no-op", async () => {
        const locations = roots("taskmap-native-default-builder-");
        const snapshotPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "meeting-producer-snapshot.v1.json");
        const userId = "owner-service-test";
        const nowMs = Date.parse("2026-07-29T13:00:00.000Z");
        writeMeetingProducerSnapshot(snapshotPath, { userId });
        const first = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId: userId,
            meetingProducerSnapshotPath: snapshotPath,
            collectors: nonMeetingCollectors(),
            nowMs: () => nowMs,
        });
        const firstResult = await first.requestRefresh("manual");
        assert.equal(firstResult.refreshStatus, "published");
        assert.equal(firstResult.publicationVerified, true);
        assert.equal(firstResult.publicationBlockReason, null);
        const projection = JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8"));
        assert.equal(projection.tasks.length, 1);
        assert.equal(projection.tasks[0].reviewState, "proposed");
        assert.equal(projection.tasks[0].authority, "none");
        const currentness = JSON.parse((0, node_fs_1.readFileSync)(locations.currentnessPath, "utf8"));
        assert.deepEqual(currentness.taskDispositions, [{
                taskId: projection.tasks[0].id,
                disposition: "needs_lifecycle_review",
            }]);
        const projectionBefore = (0, node_fs_1.readFileSync)(locations.projectionPath);
        const currentnessBefore = (0, node_fs_1.readFileSync)(locations.currentnessPath);
        const replay = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId: userId,
            meetingProducerSnapshotPath: snapshotPath,
            collectors: nonMeetingCollectors(),
            nowMs: () => nowMs,
        });
        const replayResult = await replay.requestRefresh("manual");
        assert.equal(replayResult.refreshStatus, "no_op");
        assert.equal(replayResult.publicationVerified, true);
        assert.deepEqual((0, node_fs_1.readFileSync)(locations.projectionPath), projectionBefore);
        assert.deepEqual((0, node_fs_1.readFileSync)(locations.currentnessPath), currentnessBefore);
    });
    (0, node_test_1.it)("uses one fixed assessment time when the refresh clock advances during collection", async () => {
        const locations = roots("taskmap-native-fixed-assessment-time-");
        const sourceRoot = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "agent-producer");
        const agentSnapshotPath = node_path_1.default.join(sourceRoot, "agent-session-producer-snapshot.v1.json");
        const meetingSnapshotPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "meeting-producer-snapshot.v1.json");
        const ownerUserId = "fixed-assessment-owner";
        const requestedAtMs = Date.parse("2026-07-29T13:00:00.000Z");
        let clockReads = 0;
        (0, node_fs_1.mkdirSync)(sourceRoot, { recursive: true, mode: 0o700 });
        writeMeetingProducerSnapshot(meetingSnapshotPath, {
            userId: ownerUserId,
        });
        const service = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId,
            meetingProducerSnapshotPath: meetingSnapshotPath,
            sourcePaths: {
                agentSessionRoots: [],
                agentSessionProducerSnapshotPath: agentSnapshotPath,
            },
            collectors: {
                calendar: async () => slice("calendar"),
                body: async () => slice("body"),
            },
            nowMs: () => requestedAtMs + (clockReads++ === 0 ? 0 : 96),
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.requestedAtMs, requestedAtMs);
        assert.equal(result.refreshStatus, "published");
        assert.equal(result.publicationVerified, true);
        assert.equal(result.publicationBlockReason, null);
        const agentSnapshot = JSON.parse((0, node_fs_1.readFileSync)(agentSnapshotPath, "utf8"));
        assert.equal(agentSnapshot.producedAt, new Date(requestedAtMs).toISOString());
        assert.ok(clockReads >= 2);
    });
    (0, node_test_1.it)("runs verified raw Granola extraction in the production meeting path without blocking Google evidence", async () => {
        const locations = roots("taskmap-native-granola-extraction-");
        const ownerLabel = "granola-production-refresh-owner";
        const owner = (0, confirmed_owner_js_1.confirmedTestOwner)(ownerLabel);
        const producerPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "meeting-producer-snapshot.v1.json");
        const rawPath = node_path_1.default.join(owner.sourceRoot, "granola-mcp-snapshot.json");
        const promptPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "mention-extraction-v1.md");
        const body = "Agenda. I will ship the production replay lane. Closing.";
        const mention = "I will ship the production replay lane.";
        writeMeetingProducerSnapshot(producerPath, { userId: ownerLabel });
        (0, node_fs_1.mkdirSync)(owner.taskMapRoot, { recursive: true, mode: 0o700 });
        (0, node_fs_1.mkdirSync)(owner.sourceRoot, { recursive: true, mode: 0o700 });
        const rawBytes = JSON.stringify({
            events: [],
            meeting_notes: [{
                    id: "raw-production-note",
                    source: "granola",
                    source_ref: "raw-production-note",
                    title: "Planning",
                    created_at: "2026-07-29T09:00:00.000Z",
                    occurred_at: "2026-07-29T09:00:00.000Z",
                    participants: ["Owner"],
                    summary: body,
                    body,
                    transcript: [],
                    topics: [],
                }],
        });
        (0, node_fs_1.writeFileSync)(rawPath, rawBytes, { mode: 0o600 });
        const granolaSuccessAt = "2026-07-29T12:59:00.000Z";
        (0, node_fs_1.utimesSync)(rawPath, new Date(granolaSuccessAt), new Date(granolaSuccessAt));
        (0, node_fs_1.writeFileSync)(node_path_1.default.join(owner.sourceRoot, "taskmap-resident-receipt.v1.json"), JSON.stringify({
            contractVersion: "taskmap-resident-receipt.v1",
            ownerScopeDigest: owner.ownerScopeDigest,
            granola_mcp_success: granolaSuccessAt,
            granola_mcp_snapshot_sha256: (0, node_crypto_1.createHash)("sha256")
                .update(rawBytes)
                .digest("hex"),
        }), { mode: 0o600 });
        (0, node_fs_1.writeFileSync)(promptPath, "Return strict JSON only.\n", { mode: 0o600 });
        let stationSelections = 0;
        const service = new TaskMapNativeRefreshService({
            ...locations,
            confirmedOwner: owner,
            meetingProducerSnapshotPath: producerPath,
            sourcePaths: {
                meetingSnapshotPaths: [
                    { sourceLabel: "gdocs", filePath: producerPath },
                    { sourceLabel: "granola", filePath: rawPath },
                ],
            },
            collectors: nonMeetingCollectors(),
            rawGranolaSnapshotPath: rawPath,
            meetingExtractionPromptTemplatePath: promptPath,
            createMeetingExtractionStation: async () => {
                stationSelections += 1;
                return {
                    provider: {
                        transport: "claude-cli",
                        executable: "/private/claude",
                        args: [],
                        model: "private-model",
                    },
                    async run(request) {
                        return {
                            stationId: "mention-extraction-v1",
                            model: "private-model",
                            promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                            inputDigest: request.inputDigest,
                            outputJson: JSON.stringify({ mentions: [{
                                        class: "commitment",
                                        actor: "self",
                                        text: mention,
                                        title: "Ship production replay",
                                        confidence: 0.92,
                                    }] }),
                            producedAt: "2026-07-29T13:00:00.000Z",
                            transport: "claude-cli",
                        };
                    },
                };
            },
            nowMs: () => Date.parse("2026-07-29T13:00:00.000Z"),
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published");
        assert.equal(stationSelections, 1);
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(locations.runtimeRoot, "taskmap-meeting-extraction-report.v1.json")), true);
    });
    (0, node_test_1.it)("emits and persists one station-wide unauthenticated code through a due no-op", async () => {
        const fixture = rawGranolaDegradationFixture("taskmap-native-granola-auth-degradation-", "granola-auth-degradation-owner", ["I will ship A.", "I will ship B."]);
        let nowMs = Date.parse("2026-07-29T13:00:00.000Z");
        let stationSelections = 0;
        const service = new TaskMapNativeRefreshService({
            ...fixture,
            confirmedOwner: fixture.owner,
            meetingProducerSnapshotPath: fixture.producerPath,
            sourcePaths: {
                meetingSnapshotPaths: [
                    { sourceLabel: "gdocs", filePath: fixture.producerPath },
                    { sourceLabel: "granola", filePath: fixture.rawPath },
                ],
            },
            collectors: nonMeetingCollectors(),
            rawGranolaSnapshotPath: fixture.rawPath,
            meetingExtractionPromptTemplatePath: fixture.promptPath,
            createMeetingExtractionStation: async () => {
                stationSelections += 1;
                throw new llm_station_js_1.LlmStationUnavailableError("provider_unauthenticated", "claude-cli");
            },
            nowMs: () => nowMs,
        });
        const first = await service.requestRefresh("manual");
        const firstMeeting = first.sourceStatuses.find((status) => status.source === "meeting_notes");
        assert.equal(stationSelections, 1);
        assert.equal(firstMeeting?.extractionDegradationCode, "provider_unauthenticated");
        assert.equal(first.publicationBlockReason, null);
        const persistedState = JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(fixture.runtimeRoot, "taskmap-refresh-state.v1.json"), "utf8"));
        assert.equal(persistedState.lastSourceStatuses.find((status) => status.source === "meeting_notes")?.extractionDegradationCode, "provider_unauthenticated");
        nowMs += 60_000;
        const due = await service.requestRefresh("timer");
        assert.equal(due.refreshStatus, "no_op");
        assert.equal(due.sourceStatuses.find((status) => status.source === "meeting_notes")?.extractionDegradationCode, "provider_unauthenticated");
        assert.equal(due.publicationBlockReason, null);
    });
    (0, node_test_1.it)("emits the same station-wide contract when no supported provider exists", async () => {
        const fixture = rawGranolaDegradationFixture("taskmap-native-granola-no-provider-", "granola-no-provider-owner", ["I will ship the provider setup."]);
        const service = new TaskMapNativeRefreshService({
            ...fixture,
            confirmedOwner: fixture.owner,
            meetingProducerSnapshotPath: fixture.producerPath,
            sourcePaths: {
                meetingSnapshotPaths: [
                    { sourceLabel: "gdocs", filePath: fixture.producerPath },
                    { sourceLabel: "granola", filePath: fixture.rawPath },
                ],
            },
            collectors: nonMeetingCollectors(),
            rawGranolaSnapshotPath: fixture.rawPath,
            meetingExtractionPromptTemplatePath: fixture.promptPath,
            createMeetingExtractionStation: async () => {
                throw new llm_station_js_1.LlmStationUnavailableError("no_provider");
            },
            nowMs: () => Date.parse("2026-07-29T13:00:00.000Z"),
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.sourceStatuses.find((status) => status.source === "meeting_notes")?.extractionDegradationCode, "no_provider");
        assert.equal(result.publicationBlockReason, null);
    });
    (0, node_test_1.it)("reports remote consent as partial for meeting extraction and retries after consent", async () => {
        const body = "I will ship after approving DaoBrew Cloud AI.";
        const fixture = rawGranolaDegradationFixture("taskmap-native-granola-consent-required-", "granola-consent-required-owner", [body]);
        let nowMs = Date.parse("2026-07-29T13:00:00.000Z");
        let consentGranted = false;
        let stationSelections = 0;
        const service = new TaskMapNativeRefreshService({
            ...fixture,
            confirmedOwner: fixture.owner,
            meetingProducerSnapshotPath: fixture.producerPath,
            sourcePaths: {
                meetingSnapshotPaths: [
                    { sourceLabel: "gdocs", filePath: fixture.producerPath },
                    { sourceLabel: "granola", filePath: fixture.rawPath },
                ],
            },
            collectors: nonMeetingCollectors(),
            rawGranolaSnapshotPath: fixture.rawPath,
            meetingExtractionPromptTemplatePath: fixture.promptPath,
            createMeetingExtractionStation: async () => {
                stationSelections += 1;
                if (!consentGranted) {
                    throw new llm_station_js_1.LlmStationUnavailableError("remote_consent_required");
                }
                return {
                    provider: {
                        transport: "gemini-remote",
                        executable: "",
                        args: [],
                        model: "gemini-fixture",
                    },
                    async run(request) {
                        return {
                            stationId: "mention-extraction-v1",
                            model: "gemini-fixture",
                            promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                            inputDigest: request.inputDigest,
                            outputJson: JSON.stringify({ mentions: [{
                                        class: "commitment",
                                        actor: "self",
                                        text: body,
                                        title: "Ship after cloud consent",
                                        confidence: 0.92,
                                    }] }),
                            producedAt: new Date(nowMs).toISOString(),
                            transport: "gemini-remote",
                        };
                    },
                };
            },
            nowMs: () => nowMs,
        });
        const degraded = await service.requestRefresh("manual");
        assert.equal(degraded.status, "partial");
        assert.equal(degraded.sourceStatuses.find((status) => status.source === "meeting_notes")?.extractionDegradationCode, "remote_consent_required");
        consentGranted = true;
        nowMs += 60_000;
        const recovered = await service.requestRefresh("timer");
        assert.notEqual(recovered.refreshStatus, "unavailable");
        assert.equal(stationSelections, 2);
        assert.equal(recovered.sourceStatuses.find((status) => status.source === "meeting_notes")?.extractionDegradationCode, undefined);
    });
    (0, node_test_1.it)("clears a persisted station-wide code after the next partial-success report", async () => {
        const degradedBody = "I will ship the initially degraded note.";
        const extractedBody = "I will ship the later extracted note.";
        const fixture = rawGranolaDegradationFixture("taskmap-native-granola-degradation-clear-", "granola-degradation-clear-owner", [degradedBody, extractedBody]);
        let nowMs = Date.parse("2026-07-29T13:00:00.000Z");
        let stationSelections = 0;
        const service = new TaskMapNativeRefreshService({
            ...fixture,
            confirmedOwner: fixture.owner,
            meetingProducerSnapshotPath: fixture.producerPath,
            sourcePaths: {
                meetingSnapshotPaths: [
                    { sourceLabel: "gdocs", filePath: fixture.producerPath },
                    { sourceLabel: "granola", filePath: fixture.rawPath },
                ],
            },
            collectors: nonMeetingCollectors(),
            rawGranolaSnapshotPath: fixture.rawPath,
            meetingExtractionPromptTemplatePath: fixture.promptPath,
            createMeetingExtractionStation: async () => {
                stationSelections += 1;
                if (stationSelections === 1) {
                    throw new llm_station_js_1.LlmStationUnavailableError("provider_unauthenticated", "claude-cli");
                }
                return {
                    provider: {
                        transport: "claude-cli",
                        executable: "/private/claude",
                        args: [],
                        model: "private-model",
                    },
                    async run(request) {
                        if (request.promptText.includes(degradedBody)) {
                            throw new llm_station_js_1.LlmStationUnavailableError("provider_unauthenticated", "claude-cli");
                        }
                        return {
                            stationId: "mention-extraction-v1",
                            model: "private-model",
                            promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                            inputDigest: request.inputDigest,
                            outputJson: JSON.stringify({ mentions: [{
                                        class: "commitment",
                                        actor: "self",
                                        text: extractedBody,
                                        title: "Ship degradation clearing",
                                        confidence: 0.92,
                                    }] }),
                            producedAt: "2026-07-29T13:01:00.000Z",
                            transport: "claude-cli",
                        };
                    },
                };
            },
            nowMs: () => nowMs,
        });
        const first = await service.requestRefresh("manual");
        assert.equal(first.sourceStatuses.find((status) => status.source === "meeting_notes")?.extractionDegradationCode, "provider_unauthenticated");
        const firstPersistedStatus = JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(fixture.runtimeRoot, "taskmap-refresh-status.v1.json"), "utf8"));
        assert.equal(firstPersistedStatus.sourceStatuses.find((status) => status.source === "meeting_notes")?.extractionDegradationCode, "provider_unauthenticated");
        nowMs += 60_000;
        const second = await service.requestRefresh("timer");
        assert.equal(second.refreshStatus, "no_op");
        assert.equal(second.publicationBlockReason, null);
        assert.equal(second.sourceStatuses.find((status) => status.source === "meeting_notes")?.extractionDegradationCode, undefined);
        for (const [filename, key] of [
            ["taskmap-refresh-state.v1.json", "lastSourceStatuses"],
            ["taskmap-refresh-status.v1.json", "sourceStatuses"],
        ]) {
            const persisted = JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(fixture.runtimeRoot, filename), "utf8"));
            const statuses = persisted[key];
            assert.equal(statuses.find((status) => status.source === "meeting_notes")?.extractionDegradationCode, undefined);
        }
    });
    (0, node_test_1.it)("omits station-wide degradation when any attempted raw note extracts", async () => {
        const degradedBody = "I will ship the degraded note.";
        const extractedBody = "I will ship the extracted note.";
        const fixture = rawGranolaDegradationFixture("taskmap-native-granola-partial-extraction-", "granola-partial-extraction-owner", [degradedBody, extractedBody]);
        let stationSelections = 0;
        const service = new TaskMapNativeRefreshService({
            ...fixture,
            confirmedOwner: fixture.owner,
            meetingProducerSnapshotPath: fixture.producerPath,
            sourcePaths: {
                meetingSnapshotPaths: [
                    { sourceLabel: "gdocs", filePath: fixture.producerPath },
                    { sourceLabel: "granola", filePath: fixture.rawPath },
                ],
            },
            collectors: nonMeetingCollectors(),
            rawGranolaSnapshotPath: fixture.rawPath,
            meetingExtractionPromptTemplatePath: fixture.promptPath,
            createMeetingExtractionStation: async () => {
                stationSelections += 1;
                return {
                    provider: {
                        transport: "claude-cli",
                        executable: "/private/claude",
                        args: [],
                        model: "private-model",
                    },
                    async run(request) {
                        if (request.promptText.includes(degradedBody)) {
                            throw new llm_station_js_1.LlmStationUnavailableError("provider_unauthenticated", "claude-cli");
                        }
                        return {
                            stationId: "mention-extraction-v1",
                            model: "private-model",
                            promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                            inputDigest: request.inputDigest,
                            outputJson: JSON.stringify({ mentions: [{
                                        class: "commitment",
                                        actor: "self",
                                        text: extractedBody,
                                        title: "Ship partial extraction",
                                        confidence: 0.92,
                                    }] }),
                            producedAt: "2026-07-29T13:00:00.000Z",
                            transport: "claude-cli",
                        };
                    },
                };
            },
            nowMs: () => Date.parse("2026-07-29T13:00:00.000Z"),
        });
        const result = await service.requestRefresh("manual");
        assert.equal(stationSelections, 1);
        assert.equal(result.sourceStatuses.find((status) => status.source === "meeting_notes")?.extractionDegradationCode, undefined);
        const persistedStatus = JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(fixture.runtimeRoot, "taskmap-refresh-status.v1.json"), "utf8"));
        assert.equal(persistedStatus.sourceStatuses.find((status) => status.source === "meeting_notes")?.extractionDegradationCode, undefined);
    });
    (0, node_test_1.it)("drops raw Granola when its owner receipt disappears at report point-of-use", async () => {
        const locations = roots("taskmap-native-granola-receipt-race-");
        const ownerLabel = "granola-receipt-race-owner";
        const owner = (0, confirmed_owner_js_1.confirmedTestOwner)(ownerLabel);
        const missingGooglePath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "missing-google.json");
        const rawPath = node_path_1.default.join(owner.sourceRoot, "granola-mcp-snapshot.json");
        const receiptPath = node_path_1.default.join(owner.sourceRoot, "taskmap-resident-receipt.v1.json");
        const promptPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "mention-extraction-v1.md");
        const body = "Agenda. I will ship the receipt race lane. Closing.";
        (0, node_fs_1.mkdirSync)(owner.taskMapRoot, { recursive: true, mode: 0o700 });
        (0, node_fs_1.mkdirSync)(owner.sourceRoot, { recursive: true, mode: 0o700 });
        const rawBytes = JSON.stringify({
            events: [],
            meeting_notes: ["a", "b"].map((suffix) => ({
                id: `raw-receipt-race-note-${suffix}`,
                source: "granola",
                source_ref: `raw-receipt-race-note-${suffix}`,
                title: "Planning",
                created_at: suffix === "a"
                    ? "2026-07-28T09:00:00.000Z"
                    : "2026-07-29T09:00:00.000Z",
                occurred_at: suffix === "a"
                    ? "2026-07-28T09:00:00.000Z"
                    : "2026-07-29T09:00:00.000Z",
                participants: ["Owner"],
                summary: body,
                body,
                transcript: [],
                topics: [],
            })),
        });
        (0, node_fs_1.writeFileSync)(rawPath, rawBytes, { mode: 0o600 });
        const granolaSuccessAt = "2026-07-29T12:59:00.000Z";
        (0, node_fs_1.utimesSync)(rawPath, new Date(granolaSuccessAt), new Date(granolaSuccessAt));
        (0, node_fs_1.writeFileSync)(receiptPath, JSON.stringify({
            contractVersion: "taskmap-resident-receipt.v1",
            ownerScopeDigest: owner.ownerScopeDigest,
            granola_mcp_success: granolaSuccessAt,
            granola_mcp_snapshot_sha256: (0, node_crypto_1.createHash)("sha256")
                .update(rawBytes)
                .digest("hex"),
        }), { mode: 0o600 });
        (0, node_fs_1.writeFileSync)(promptPath, "Return strict JSON only.\n", { mode: 0o600 });
        let raceInjected = false;
        const service = new TaskMapNativeRefreshService({
            ...locations,
            confirmedOwner: owner,
            meetingProducerSnapshotPath: missingGooglePath,
            sourcePaths: {
                meetingSnapshotPaths: [
                    { sourceLabel: "granola", filePath: rawPath },
                ],
            },
            collectors: nonMeetingCollectors(),
            rawGranolaSnapshotPath: rawPath,
            meetingExtractionPromptTemplatePath: promptPath,
            createMeetingExtractionStation: async () => ({
                provider: {
                    transport: "codex-cli",
                    executable: "/private/codex",
                    args: [],
                    model: "default",
                },
                async run(request) {
                    return {
                        stationId: "mention-extraction-v1",
                        model: "default",
                        promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                        inputDigest: request.inputDigest,
                        outputJson: JSON.stringify({ mentions: [{
                                    class: "commitment",
                                    actor: "self",
                                    text: body,
                                    title: "Ship receipt race lane",
                                    confidence: 0.9,
                                }] }),
                        producedAt: "2026-07-29T13:00:00.000Z",
                        transport: "codex-cli",
                    };
                },
            }),
            afterDefaultContextFreshSlicesForTesting: async () => {
                if (raceInjected)
                    return;
                raceInjected = true;
                (0, node_fs_1.rmSync)(receiptPath);
            },
            nowMs: () => Date.parse("2026-07-29T13:00:00.000Z"),
        });
        const result = await service.requestRefresh("manual");
        assert.equal(raceInjected, true);
        if (result.refreshStatus === "published") {
            const projection = JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8"));
            assert.ok(projection.sources.every((source) => source.sourceKind !== "granola"), "receiptless raw evidence must not reach publication");
        }
    });
    (0, node_test_1.it)("degrades only raw Granola when durable report persistence fails", async () => {
        const locations = roots("taskmap-native-granola-report-failure-");
        const ownerLabel = "granola-report-failure-owner";
        const owner = (0, confirmed_owner_js_1.confirmedTestOwner)(ownerLabel);
        const producerPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "meeting-producer-snapshot.v1.json");
        const rawPath = node_path_1.default.join(owner.sourceRoot, "granola-mcp-snapshot.json");
        const promptPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "mention-extraction-v1.md");
        const body = "I will ship the raw persistence barrier.";
        writeMeetingProducerSnapshot(producerPath, { userId: ownerLabel });
        (0, node_fs_1.mkdirSync)(owner.taskMapRoot, { recursive: true, mode: 0o700 });
        (0, node_fs_1.mkdirSync)(owner.sourceRoot, { recursive: true, mode: 0o700 });
        const rawBytes = JSON.stringify({
            events: [],
            meeting_notes: [{
                    id: "raw-report-failure-note",
                    source: "granola",
                    source_ref: "raw-report-failure-note",
                    title: "Planning",
                    created_at: "2026-07-29T09:00:00.000Z",
                    occurred_at: "2026-07-29T09:00:00.000Z",
                    participants: ["Owner"],
                    summary: body,
                    body,
                    transcript: [],
                    topics: [],
                }],
        });
        (0, node_fs_1.writeFileSync)(rawPath, rawBytes, { mode: 0o600 });
        const granolaSuccessAt = "2026-07-29T12:59:00.000Z";
        (0, node_fs_1.utimesSync)(rawPath, new Date(granolaSuccessAt), new Date(granolaSuccessAt));
        (0, node_fs_1.writeFileSync)(node_path_1.default.join(owner.sourceRoot, "taskmap-resident-receipt.v1.json"), JSON.stringify({
            contractVersion: "taskmap-resident-receipt.v1",
            ownerScopeDigest: owner.ownerScopeDigest,
            granola_mcp_success: granolaSuccessAt,
            granola_mcp_snapshot_sha256: (0, node_crypto_1.createHash)("sha256")
                .update(rawBytes)
                .digest("hex"),
        }), { mode: 0o600 });
        (0, node_fs_1.writeFileSync)(promptPath, "Return strict JSON only.\n", { mode: 0o600 });
        (0, node_fs_1.mkdirSync)(node_path_1.default.join(locations.runtimeRoot, "taskmap-meeting-extraction-report.v1.json"), { recursive: true, mode: 0o700 });
        const service = new TaskMapNativeRefreshService({
            ...locations,
            confirmedOwner: owner,
            meetingProducerSnapshotPath: producerPath,
            sourcePaths: {
                meetingSnapshotPaths: [
                    { sourceLabel: "gdocs", filePath: producerPath },
                    { sourceLabel: "granola", filePath: rawPath },
                ],
            },
            collectors: nonMeetingCollectors(),
            rawGranolaSnapshotPath: rawPath,
            meetingExtractionPromptTemplatePath: promptPath,
            createMeetingExtractionStation: async () => ({
                provider: {
                    transport: "codex-cli",
                    executable: "/private/codex",
                    args: [],
                    model: "default",
                },
                async run(request) {
                    return {
                        stationId: "mention-extraction-v1",
                        model: "default",
                        promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                        inputDigest: request.inputDigest,
                        outputJson: JSON.stringify({ mentions: [{
                                    class: "commitment",
                                    actor: "self",
                                    text: body,
                                    title: "Ship raw persistence barrier",
                                    confidence: 0.9,
                                }] }),
                        producedAt: "2026-07-29T13:00:00.000Z",
                        transport: "codex-cli",
                    };
                },
            }),
            nowMs: () => Date.parse("2026-07-29T13:00:00.000Z"),
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published");
        const projection = JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8"));
        assert.ok(projection.sources.some((source) => source.sourceKind === "gemini_meet"));
        assert.ok(projection.sources.every((source) => source.sourceKind !== "granola"));
    });
    (0, node_test_1.it)("rejects future raw note time before provider selection or envelope writes", async () => {
        const locations = roots("taskmap-native-granola-future-note-");
        const ownerLabel = "granola-future-note-owner";
        const owner = (0, confirmed_owner_js_1.confirmedTestOwner)(ownerLabel);
        const producerPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "meeting-producer-snapshot.v1.json");
        const rawPath = node_path_1.default.join(owner.homeDirectory, ".daobrew", "granola-mcp-snapshot.json");
        const promptPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "mention-extraction-v1.md");
        const body = "I will ship the future-time guard.";
        writeMeetingProducerSnapshot(producerPath, { userId: ownerLabel });
        (0, node_fs_1.mkdirSync)(owner.taskMapRoot, { recursive: true, mode: 0o700 });
        (0, node_fs_1.writeFileSync)(rawPath, JSON.stringify({
            events: [],
            meeting_notes: [{
                    id: "future-raw-note",
                    source: "granola",
                    source_ref: "future-raw-note",
                    title: "Planning",
                    created_at: "2026-07-29T14:00:00.000Z",
                    occurred_at: "2026-07-29T14:00:00.000Z",
                    participants: ["Owner"],
                    summary: body,
                    body,
                    transcript: [],
                    topics: [],
                }],
        }), { mode: 0o600 });
        (0, node_fs_1.writeFileSync)(promptPath, "Return strict JSON only.\n", { mode: 0o600 });
        let factoryCalls = 0;
        let runCalls = 0;
        const service = new TaskMapNativeRefreshService({
            ...locations,
            confirmedOwner: owner,
            meetingProducerSnapshotPath: producerPath,
            sourcePaths: {
                meetingSnapshotPaths: [
                    { sourceLabel: "gdocs", filePath: producerPath },
                    { sourceLabel: "granola", filePath: rawPath },
                ],
            },
            collectors: nonMeetingCollectors(),
            rawGranolaSnapshotPath: rawPath,
            meetingExtractionPromptTemplatePath: promptPath,
            createMeetingExtractionStation: async () => {
                factoryCalls += 1;
                return {
                    provider: {
                        transport: "codex-cli",
                        executable: "/private/codex",
                        args: [],
                        model: "default",
                    },
                    async run(request) {
                        runCalls += 1;
                        return {
                            stationId: "mention-extraction-v1",
                            model: "default",
                            promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                            inputDigest: request.inputDigest,
                            outputJson: JSON.stringify({ mentions: [{
                                        class: "commitment",
                                        actor: "self",
                                        text: body,
                                        title: "Ship the future-time guard",
                                        confidence: 0.9,
                                    }] }),
                            producedAt: "2026-07-29T13:00:00.000Z",
                            transport: "codex-cli",
                        };
                    },
                };
            },
            nowMs: () => Date.parse("2026-07-29T13:00:00.000Z"),
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published");
        assert.equal(factoryCalls, 0);
        assert.equal(runCalls, 0);
        const envelopeRoot = node_path_1.default.join(owner.taskMapRoot, "llm-envelopes", "mention-extraction-v1");
        assert.equal((0, node_fs_1.existsSync)(envelopeRoot) ? (0, node_fs_1.readdirSync)(envelopeRoot).length : 0, 0);
        const projection = JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8"));
        assert.ok(projection.sources.some((source) => source.sourceKind === "gemini_meet"));
        assert.ok(projection.sources.every((source) => source.sourceKind !== "granola"));
    });
    (0, node_test_1.it)("revalidates the persisted raw report after a first-collector snapshot swap", async () => {
        const locations = roots("taskmap-native-granola-report-swap-");
        const ownerLabel = "granola-report-swap-owner";
        const owner = (0, confirmed_owner_js_1.confirmedTestOwner)(ownerLabel);
        const producerPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "meeting-producer-snapshot.v1.json");
        const rawPath = node_path_1.default.join(owner.homeDirectory, ".daobrew", "granola-mcp-snapshot.json");
        const promptPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "mention-extraction-v1.md");
        const oldBody = "I will ship the old raw snapshot.";
        const newBody = "I will ship the swapped raw snapshot.";
        const rawSnapshot = (id, body) => JSON.stringify({
            events: [],
            meeting_notes: ["a", "b"].map((suffix) => ({
                id: `${id}-${suffix}`,
                source: "granola",
                source_ref: `${id}-${suffix}`,
                title: "Planning",
                created_at: suffix === "a"
                    ? "2026-07-28T09:00:00.000Z"
                    : "2026-07-29T09:00:00.000Z",
                occurred_at: suffix === "a"
                    ? "2026-07-28T09:00:00.000Z"
                    : "2026-07-29T09:00:00.000Z",
                participants: ["Owner"],
                summary: body,
                body,
                transcript: [],
                topics: [],
            })),
        });
        writeMeetingProducerSnapshot(producerPath, {
            userId: ownerLabel,
            meetings: [],
        });
        (0, node_fs_1.mkdirSync)(owner.taskMapRoot, { recursive: true, mode: 0o700 });
        (0, node_fs_1.mkdirSync)(owner.sourceRoot, { recursive: true, mode: 0o700 });
        const initialRawBytes = rawSnapshot("raw-before-collector", oldBody);
        (0, node_fs_1.writeFileSync)(rawPath, initialRawBytes, { mode: 0o600 });
        const granolaSuccessAt = "2026-07-29T12:59:00.000Z";
        (0, node_fs_1.utimesSync)(rawPath, new Date(granolaSuccessAt), new Date(granolaSuccessAt));
        (0, node_fs_1.writeFileSync)(node_path_1.default.join(owner.sourceRoot, "taskmap-resident-receipt.v1.json"), JSON.stringify({
            contractVersion: "taskmap-resident-receipt.v1",
            ownerScopeDigest: owner.ownerScopeDigest,
            granola_mcp_success: granolaSuccessAt,
            granola_mcp_snapshot_sha256: (0, node_crypto_1.createHash)("sha256")
                .update(initialRawBytes)
                .digest("hex"),
        }), { mode: 0o600 });
        (0, node_fs_1.writeFileSync)(promptPath, "Return strict JSON only.\n", { mode: 0o600 });
        let swapped = false;
        const service = new TaskMapNativeRefreshService({
            ...locations,
            confirmedOwner: owner,
            meetingProducerSnapshotPath: producerPath,
            sourcePaths: {
                meetingSnapshotPaths: [
                    { sourceLabel: "gdocs", filePath: producerPath },
                    { sourceLabel: "granola", filePath: rawPath },
                ],
            },
            collectors: {
                agent_session: async () => {
                    (0, node_fs_1.writeFileSync)(rawPath, rawSnapshot("raw-after-collector", newBody), { mode: 0o600 });
                    swapped = true;
                    return slice("agent_session");
                },
                calendar: async () => slice("calendar"),
                body: async () => slice("body"),
            },
            rawGranolaSnapshotPath: rawPath,
            meetingExtractionPromptTemplatePath: promptPath,
            createMeetingExtractionStation: async () => ({
                provider: {
                    transport: "codex-cli",
                    executable: "/private/codex",
                    args: [],
                    model: "default",
                },
                async run(request) {
                    return {
                        stationId: "mention-extraction-v1",
                        model: "default",
                        promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                        inputDigest: request.inputDigest,
                        outputJson: JSON.stringify({ mentions: [{
                                    class: "commitment",
                                    actor: "self",
                                    text: oldBody,
                                    title: "Ship the old raw snapshot",
                                    confidence: 0.9,
                                }] }),
                        producedAt: "2026-07-29T13:00:00.000Z",
                        transport: "codex-cli",
                    };
                },
            }),
            nowMs: () => Date.parse("2026-07-29T13:00:00.000Z"),
        });
        const result = await service.requestRefresh("manual");
        assert.equal(swapped, true);
        assert.equal(result.refreshStatus, "published");
        const report = artifact(locations.runtimeRoot, "taskmap-meeting-extraction-report.v1.json");
        assert.notEqual(report.sourceSnapshotDigest, (0, source_contracts_js_1.taskMapContractDigest)((0, node_fs_1.readFileSync)(rawPath, "utf8")), "the probe must leave the durable report bound to the old raw bytes");
        const projection = JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8"));
        assert.equal(result.sourceStatuses.find((status) => status.source === "meeting_notes")?.disposition, "fresh", "the deterministic fresh-empty Google family must remain available");
        assert.ok(projection.sources.every((source) => source.sourceKind !== "granola"), "a stale raw report must not reach semantic projection");
    });
    (0, node_test_1.it)("runs the raw-only production path when Google meeting evidence is unavailable", async () => {
        const locations = roots("taskmap-native-granola-only-");
        const owner = (0, confirmed_owner_js_1.confirmedTestOwner)("granola-only-refresh-owner");
        const rawPath = node_path_1.default.join(owner.sourceRoot, "granola-mcp-snapshot.json");
        const missingGooglePath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "missing-google.json");
        const promptPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "mention-extraction-v1.md");
        const body = "I will ship the raw-only replay lane.";
        (0, node_fs_1.mkdirSync)(owner.taskMapRoot, { recursive: true, mode: 0o700 });
        (0, node_fs_1.mkdirSync)(owner.sourceRoot, { recursive: true, mode: 0o700 });
        const rawBytes = JSON.stringify({
            events: [],
            meeting_notes: [
                {
                    id: "raw-only-a",
                    source: "granola",
                    source_ref: "raw-only-a",
                    title: "Planning A",
                    created_at: "2026-07-28T09:00:00.000Z",
                    occurred_at: "2026-07-28T09:00:00.000Z",
                    participants: [],
                    summary: body,
                    body,
                    transcript: [],
                    topics: [],
                },
                {
                    id: "raw-only-b",
                    source: "granola",
                    source_ref: "raw-only-b",
                    title: "Planning B",
                    created_at: "2026-07-29T09:00:00.000Z",
                    occurred_at: "2026-07-29T09:00:00.000Z",
                    participants: [],
                    summary: body,
                    body,
                    transcript: [],
                    topics: [],
                },
            ],
        });
        (0, node_fs_1.writeFileSync)(rawPath, rawBytes, { mode: 0o600 });
        const granolaSuccessAt = "2026-07-29T12:59:00.000Z";
        (0, node_fs_1.utimesSync)(rawPath, new Date(granolaSuccessAt), new Date(granolaSuccessAt));
        (0, node_fs_1.writeFileSync)(node_path_1.default.join(owner.sourceRoot, "taskmap-resident-receipt.v1.json"), JSON.stringify({
            contractVersion: "taskmap-resident-receipt.v1",
            ownerScopeDigest: owner.ownerScopeDigest,
            granola_mcp_success: granolaSuccessAt,
            granola_mcp_snapshot_sha256: (0, node_crypto_1.createHash)("sha256")
                .update(rawBytes)
                .digest("hex"),
        }), { mode: 0o600 });
        (0, node_fs_1.writeFileSync)(promptPath, "Return strict JSON only.\n", { mode: 0o600 });
        let stationSelections = 0;
        const service = new TaskMapNativeRefreshService({
            ...locations,
            confirmedOwner: owner,
            meetingProducerSnapshotPath: missingGooglePath,
            sourcePaths: {
                meetingSnapshotPaths: [{ sourceLabel: "granola", filePath: rawPath }],
            },
            collectors: nonMeetingCollectors(),
            rawGranolaSnapshotPath: rawPath,
            meetingExtractionPromptTemplatePath: promptPath,
            createMeetingExtractionStation: async () => {
                stationSelections += 1;
                return {
                    provider: { transport: "codex-cli", executable: "/private/codex", args: [], model: "default" },
                    async run(request) {
                        return {
                            stationId: "mention-extraction-v1",
                            model: "default",
                            promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                            inputDigest: request.inputDigest,
                            outputJson: JSON.stringify({ mentions: [{
                                        class: "commitment",
                                        actor: "self",
                                        text: body,
                                        title: "Ship raw-only replay",
                                        confidence: 0.9,
                                    }] }),
                            producedAt: "2026-07-29T13:00:00.000Z",
                            transport: "codex-cli",
                        };
                    },
                };
            },
            nowMs: () => Date.parse("2026-07-29T13:00:00.000Z"),
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published");
        assert.equal(stationSelections, 1, "identical bodies share one raw envelope");
        const projection = JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8"));
        assert.ok(projection.sources.every((source) => source.sourceKind !== "gemini_meet"));
    });
    (0, node_test_1.it)("rehydrates an accepted receipt after restart when every meeting source is unavailable", async () => {
        const locations = roots("taskmap-native-receipt-only-");
        const owner = (0, confirmed_owner_js_1.confirmedTestOwner)("receipt-only-refresh-owner");
        const assessedAt = "2026-08-03T12:00:00.000Z";
        const snapshot = (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)({
            ownerScopeDigest: owner.ownerScopeDigest,
            producerVersion: meeting_producer_freshness_js_1.TASKMAP_MEETING_PRODUCER_VERSION,
            producedAt: "2026-08-03T11:59:00.000Z",
            meetings: [{
                    binding: meetingProducerBinding(),
                    documentId: "receipt-only-source",
                    revisionId: "receipt-only-revision",
                    contentDigest: digest("receipt-only-content"),
                    modifiedAt: "2026-08-03T11:58:00.000Z",
                    eventTime: "2026-08-03T11:55:00.000Z",
                    observedAt: "2026-08-03T11:59:00.000Z",
                    evidence: [{
                            kind: "commitment",
                            title: "Ship receipt-only accepted work",
                            summary: "Keep accepted work when meeting providers are unavailable.",
                            occurredAt: "2026-08-03T11:55:00.000Z",
                            observedAt: "2026-08-03T11:59:00.000Z",
                            status: "open",
                            quality: "structured_generated",
                            coverage: "partial",
                            confidence: 0.96,
                            speechActClass: "commitment",
                            speechActActor: "self",
                            mentionIdentityDigest: digest("receipt-only-mention"),
                            extractionEnvelopeDigest: digest("receipt-only-envelope"),
                        }],
                }],
        });
        const producer = (0, meeting_producer_freshness_js_1.assessTaskMapMeetingProducerSnapshot)(snapshot, assessedAt);
        const overlay = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateReview)({
            result: producer,
            previous: null,
            expectedOwnerScopeDigest: owner.ownerScopeDigest,
            assessedAt,
        });
        const row = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateShelf)(producer, overlay, assessedAt).candidates[0];
        const promoted = (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)({
            result: producer,
            overlay,
            previousStore: null,
            expectedOwnerScopeDigest: owner.ownerScopeDigest,
            assessedAt,
            candidateId: row.candidateId,
            expectedCandidateRevisionDigest: row.candidateRevisionDigest,
            expectedStatementReferenceDigest: row.statementReferenceDigest,
            expectedEvidenceProofDigests: row.evidenceProofDigests,
            idempotencyKeyDigest: digest("receipt-only-owner-confirmation"),
            confirmedAt: assessedAt,
        });
        (0, node_fs_1.mkdirSync)(owner.ownerRoot, { recursive: true, mode: 0o700 });
        await (0, native_candidate_acceptance_js_1.writeTaskMapNativeCandidateAcceptanceStore)({
            storePath: node_path_1.default.join(owner.taskMapRoot, "native-candidate-acceptance.v1.json"),
            expectedOwnerScopeDigest: owner.ownerScopeDigest,
            store: promoted.store,
        });
        const missingGoogle = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "missing-meeting-producer.json");
        const options = {
            ...locations,
            confirmedOwner: owner,
            meetingProducerSnapshotPath: missingGoogle,
            sourcePaths: { meetingSnapshotPaths: [] },
            collectors: nonMeetingCollectors(),
            nowMs: () => Date.parse(assessedAt),
        };
        const first = await new TaskMapNativeRefreshService(options)
            .requestRefresh("manual");
        assert.equal(first.refreshStatus, "published", JSON.stringify(first));
        const firstProjection = JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8"));
        assert.equal(firstProjection.tasks.length, 1);
        assert.equal(firstProjection.tasks[0]?.authority, "user");
        assert.equal(firstProjection.tasks[0]?.reviewState, "accepted");
        assert.deepEqual(firstProjection.tasks[0]?.citations.map((citation) => citation.sourceKind), ["manual"]);
        const restarted = await new TaskMapNativeRefreshService(options)
            .requestRefresh("manual");
        assert.notEqual(restarted.refreshStatus, "unavailable", JSON.stringify(restarted));
        const restartedProjection = JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8"));
        assert.deepEqual((0, harness_js_1.taskMapProjectionArtifactValidationReasons)(restartedProjection), []);
        assert.deepEqual(restartedProjection.tasks, firstProjection.tasks);
    });
    (0, node_test_1.it)("preserves accepted mixed-source predecessor membership when adding an unrelated receipt", async () => {
        const locations = roots("taskmap-native-receipt-mixed-predecessor-");
        const owner = (0, confirmed_owner_js_1.confirmedTestOwner)("receipt-mixed-predecessor-owner");
        const assessedAt = "2026-08-03T12:00:00.000Z";
        const predecessor = rankinglessPublicationCandidate(0, loaderCompatibleProjection());
        const deterministicSource = predecessor.projection.sources.find((source) => source.sourceKind === "google_calendar");
        for (const task of predecessor.projection.tasks) {
            if (task.reviewState !== "accepted")
                continue;
            task.citations = [{
                    ...task.citations[0],
                    pointerId: deterministicSource.id,
                    sourceKind: "google_calendar",
                    sourceRefHash: digest(`mixed-accepted:${task.id}`),
                }];
        }
        predecessor.currentness = (0, native_refresh_service_js_1.currentnessForNativeProjection)(predecessor.projection, null);
        predecessor.ranking = (0, task_ranking_publication_js_1.buildTaskMapTaskRankingPublication)({
            projection: predecessor.projection,
            ownerScopeDigest: owner.ownerScopeDigest,
            sourceStatuses: owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES.map((source) => ({
                source,
                disposition: source === "calendar"
                    ? "fresh"
                    : "unavailable",
                sliceDigest: source === "calendar"
                    ? digest("mixed-accepted-calendar")
                    : null,
            })),
        });
        const journalPath = node_path_1.default.join(locations.runtimeRoot, "taskmap-publication-journal.v1.json");
        await (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, journalPath, ownerBoundPublicationInput(predecessor, owner.ownerScopeDigest, "receipt-mixed-predecessor"));
        (0, node_fs_1.rmSync)(journalPath);
        const snapshot = (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)({
            ownerScopeDigest: owner.ownerScopeDigest,
            producerVersion: meeting_producer_freshness_js_1.TASKMAP_MEETING_PRODUCER_VERSION,
            producedAt: "2026-08-03T11:59:00.000Z",
            meetings: [{
                    binding: meetingProducerBinding(),
                    documentId: "mixed-receipt-source",
                    revisionId: "mixed-receipt-revision",
                    contentDigest: digest("mixed-receipt-content"),
                    modifiedAt: "2026-08-03T11:58:00.000Z",
                    eventTime: "2026-08-03T11:55:00.000Z",
                    observedAt: "2026-08-03T11:59:00.000Z",
                    evidence: [{
                            kind: "commitment",
                            title: "Ship unrelated confirmed receipt",
                            summary: "Preserve prior accepted membership with this receipt.",
                            occurredAt: "2026-08-03T11:55:00.000Z",
                            observedAt: "2026-08-03T11:59:00.000Z",
                            status: "open",
                            quality: "structured_generated",
                            coverage: "partial",
                            confidence: 0.96,
                            speechActClass: "commitment",
                            speechActActor: "self",
                            mentionIdentityDigest: digest("mixed-receipt-mention"),
                            extractionEnvelopeDigest: digest("mixed-receipt-envelope"),
                        }],
                }],
        });
        const producer = (0, meeting_producer_freshness_js_1.assessTaskMapMeetingProducerSnapshot)(snapshot, assessedAt);
        const overlay = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateReview)({
            result: producer,
            previous: null,
            expectedOwnerScopeDigest: owner.ownerScopeDigest,
            assessedAt,
        });
        const row = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateShelf)(producer, overlay, assessedAt).candidates[0];
        const promoted = (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)({
            result: producer,
            overlay,
            previousStore: null,
            expectedOwnerScopeDigest: owner.ownerScopeDigest,
            assessedAt,
            candidateId: row.candidateId,
            expectedCandidateRevisionDigest: row.candidateRevisionDigest,
            expectedStatementReferenceDigest: row.statementReferenceDigest,
            expectedEvidenceProofDigests: row.evidenceProofDigests,
            idempotencyKeyDigest: digest("mixed-receipt-confirmation"),
            confirmedAt: assessedAt,
        });
        (0, node_fs_1.mkdirSync)(owner.taskMapRoot, { recursive: true, mode: 0o700 });
        await (0, native_candidate_acceptance_js_1.writeTaskMapNativeCandidateAcceptanceStore)({
            storePath: node_path_1.default.join(owner.taskMapRoot, "native-candidate-acceptance.v1.json"),
            expectedOwnerScopeDigest: owner.ownerScopeDigest,
            store: promoted.store,
        });
        const ownerCalendarSlice = (revision) => {
            const current = slice("calendar", revision);
            current.ownerScopeDigest = owner.ownerScopeDigest;
            current.value.ownerScopeDigest = owner.ownerScopeDigest;
            current.sliceDigest = (0, source_contracts_js_1.taskMapContractDigest)(current.value);
            return current;
        };
        let currentCalendarSlice = ownerCalendarSlice("calendar-r1");
        const serviceOptions = {
            ...locations,
            confirmedOwner: owner,
            meetingProducerSnapshotPath: node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "missing-mixed-meeting.json"),
            sourcePaths: { meetingSnapshotPaths: [] },
            collectors: {
                ...nonMeetingCollectors(),
                calendar: async () => currentCalendarSlice,
            },
            nowMs: () => Date.parse(assessedAt),
        };
        const service = new TaskMapNativeRefreshService(serviceOptions);
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published", JSON.stringify(result));
        assert.equal(result.sourceStatuses.find((row) => row.source === "agent_session")
            ?.disposition, "unavailable");
        assert.equal(result.sourceStatuses.find((row) => row.source === "meeting_notes")
            ?.state, "unavailable");
        assert.equal(result.sourceStatuses.find((row) => row.source === "calendar")
            ?.state, "current");
        const projection = JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8"));
        const retainedAcceptedIds = predecessor.projection.tasks
            .filter((task) => task.reviewState === "accepted")
            .map((task) => task.id);
        const staleProposalIds = predecessor.projection.tasks
            .filter((task) => task.reviewState === "proposed")
            .map((task) => task.id);
        assert.deepEqual((0, harness_js_1.taskMapProjectionArtifactValidationReasons)(projection), []);
        const publishedIds = new Set(projection.tasks.map((task) => task.id));
        assert.ok(retainedAcceptedIds.every((taskId) => publishedIds.has(taskId)));
        assert.ok(staleProposalIds.every((taskId) => !publishedIds.has(taskId)));
        assert.equal(projection.tasks.filter((task) => task.reviewState === "accepted" && task.authority === "user").length, 1);
        assert.ok(projection.tasks.length >= retainedAcceptedIds.length + 1);
        assert.ok(projection.sources.some((source) => source.sourceKind === "codex_session"
            || source.sourceKind === "claude_session"));
        currentCalendarSlice = ownerCalendarSlice("calendar-r2");
        const restarted = await new TaskMapNativeRefreshService(serviceOptions)
            .requestRefresh("manual");
        assert.notEqual(restarted.refreshStatus, "unavailable", JSON.stringify(restarted));
        const restartedProjection = JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8"));
        assert.deepEqual((0, harness_js_1.taskMapProjectionArtifactValidationReasons)(restartedProjection), []);
        assert.deepEqual(restartedProjection.tasks.map((task) => task.id).sort(), projection.tasks.map((task) => task.id).sort());
        assert.ok(restartedProjection.tasks.every((task) => task.reviewState === "accepted"));
        assert.ok(staleProposalIds.every((taskId) => !restartedProjection.tasks.some((task) => task.id === taskId)));
        assert.equal(restartedProjection.tasks.filter((task) => task.reviewState === "accepted" && task.authority === "user").length, 1);
    });
    (0, node_test_1.it)("drops unrelated rejection audit rows from an accepted membership predecessor subset", () => {
        const predecessor = loaderCompatibleProjection();
        const acceptedIds = predecessor.tasks
            .filter((task) => task.reviewState === "accepted")
            .map((task) => task.id);
        predecessor.rejections = [{
                proposalId: "legacy-agent-proposal-audit",
                kind: "task",
                reasons: ["proposal-only agent evidence was not accepted"],
            }];
        for (const root of predecessor.roots)
            root.taskIds = [];
        const retained = (0, native_refresh_service_js_1.acceptedMembershipPredecessorProjection)(predecessor);
        assert.ok(retained);
        assert.deepEqual(retained.rejections, []);
        assert.deepEqual(retained.tasks.map((task) => task.id).sort(), acceptedIds.sort());
        assert.ok(retained.tasks.every((task) => task.reviewState === "accepted" && task.authority !== "none"));
        assert.deepEqual((0, harness_js_1.taskMapProjectionArtifactValidationReasons)(retained), []);
    });
    (0, node_test_1.it)("reassesses default freshness and owner scope before every shortcut", async () => {
        for (const scenario of ["expired", "owner_changed"]) {
            const locations = roots(`taskmap-native-shortcut-${scenario}-`);
            const snapshotPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "meeting-producer-snapshot.v1.json");
            const ownerUserId = `shortcut-owner-${scenario}`;
            const firstAt = Date.parse(scenario === "expired"
                ? "2026-07-29T15:59:00.000Z"
                : "2026-07-29T13:00:00.000Z");
            writeMeetingProducerSnapshot(snapshotPath, {
                userId: ownerUserId,
            });
            const first = new TaskMapNativeRefreshService({
                ...locations,
                ownerUserId,
                meetingProducerSnapshotPath: snapshotPath,
                collectors: nonMeetingCollectors(),
                nowMs: () => firstAt,
            });
            const firstResult = await first.requestRefresh("manual");
            assert.equal(firstResult.refreshStatus, "published");
            if (scenario === "expired") {
                assert.equal(firstResult.nextDueAtMs, Date.parse("2026-07-29T16:00:00.000Z"));
            }
            const baselineState = artifact(locations.runtimeRoot, "taskmap-refresh-state.v1.json");
            const projectionBefore = (0, node_fs_1.readFileSync)(locations.projectionPath);
            const currentnessBefore = (0, node_fs_1.readFileSync)(locations.currentnessPath);
            const candidateBefore = (0, node_fs_1.readFileSync)(node_path_1.default.join(locations.runtimeRoot, "taskmap-refresh-candidate.v1.json"));
            let collectionCalls = 0;
            const failedAtMs = scenario === "expired"
                ? Date.parse("2026-07-29T16:01:00.000Z")
                : firstAt + 10 * 60 * 1_000;
            const expectedBlockReason = scenario === "owner_changed"
                ? "publication_failed"
                : "semantic_provider_unavailable";
            const second = new TaskMapNativeRefreshService({
                ...locations,
                ownerUserId: scenario === "owner_changed"
                    ? "different-owner"
                    : ownerUserId,
                meetingProducerSnapshotPath: snapshotPath,
                collectors: {
                    agent_session: async () => {
                        collectionCalls += 1;
                        return slice("agent_session");
                    },
                    calendar: async () => {
                        collectionCalls += 1;
                        return slice("calendar");
                    },
                    body: async () => {
                        collectionCalls += 1;
                        return slice("body");
                    },
                },
                nowMs: () => failedAtMs,
            });
            const secondResult = await second.requestRefresh(scenario === "expired" ? "manual" : "timer");
            assert.equal(secondResult.refreshStatus, "unavailable");
            assert.equal(secondResult.publicationVerified, false);
            assert.equal(secondResult.publicationBlockReason, expectedBlockReason);
            assert.equal(collectionCalls, 3);
            assert.deepEqual((0, node_fs_1.readFileSync)(locations.projectionPath), projectionBefore);
            assert.deepEqual((0, node_fs_1.readFileSync)(locations.currentnessPath), currentnessBefore);
            assert.deepEqual((0, node_fs_1.readFileSync)(node_path_1.default.join(locations.runtimeRoot, "taskmap-refresh-candidate.v1.json")), candidateBefore);
            const failedState = artifact(locations.runtimeRoot, "taskmap-refresh-state.v1.json");
            assert.equal(failedState.lastAttemptAtMs, failedAtMs);
            assert.equal(failedState.lastSuccessfulRefreshAtMs, scenario === "expired"
                ? baselineState.lastSuccessfulRefreshAtMs
                : null);
            assert.equal(failedState.lastRefreshStatus, "unavailable");
            assert.equal(failedState.lastPublicationBlockReason, expectedBlockReason);
            for (const digestName of [
                "verifiedGraphInputDigest",
                "verifiedCandidateDigest",
                "verifiedProjectionDigest",
            ]) {
                assert.equal(failedState[digestName], scenario === "expired" ? baselineState[digestName] : null);
            }
            assert.deepEqual(failedState.sources, scenario === "expired" ? baselineState.sources : {});
            assert.equal(failedState.lastSourceStatuses.find((status) => status.source === "meeting_notes")?.disposition, "unavailable");
            const failedStatus = artifact(locations.runtimeRoot, "taskmap-refresh-status.v1.json");
            assert.equal(failedStatus.refreshStatus, "unavailable");
            assert.equal(failedStatus.publicationBlockReason, expectedBlockReason);
            assert.equal(failedStatus.failureStage, "graph_builder");
            assert.equal(failedStatus.requestedAtMs, failedAtMs);
            assert.equal(failedStatus.candidateDigest, scenario === "expired"
                ? baselineState.verifiedCandidateDigest
                : null);
            assert.equal(failedStatus.projectionDigest, scenario === "expired"
                ? baselineState.verifiedProjectionDigest
                : null);
            if (scenario === "owner_changed") {
                const recovered = new TaskMapNativeRefreshService({
                    ...locations,
                    ownerUserId,
                    meetingProducerSnapshotPath: snapshotPath,
                    collectors: nonMeetingCollectors(),
                    nowMs: () => failedAtMs + 1,
                });
                const recoveredResult = await recovered.requestRefresh("timer");
                assert.equal(recoveredResult.refreshStatus, "published");
                assert.equal(recoveredResult.publicationVerified, true);
                assert.equal(recoveredResult.publicationBlockReason, null);
            }
        }
    });
    (0, node_test_1.it)("persists unavailable truth when authenticated evidence changes during a coordinator no-op", async () => {
        const locations = roots("taskmap-native-no-op-swap-");
        const snapshotPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "meeting-producer-snapshot.v1.json");
        const ownerUserId = "no-op-swap-owner";
        const firstAtMs = Date.parse("2026-07-29T13:00:00.000Z");
        writeMeetingProducerSnapshot(snapshotPath, { userId: ownerUserId });
        const first = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId,
            meetingProducerSnapshotPath: snapshotPath,
            collectors: nonMeetingCollectors(),
            nowMs: () => firstAtMs,
        });
        assert.equal((await first.requestRefresh("manual")).refreshStatus, "published");
        const baselineState = artifact(locations.runtimeRoot, "taskmap-refresh-state.v1.json");
        const retainedMeetingSlice = baselineState.sources.meeting_notes;
        assert.ok(retainedMeetingSlice);
        const projectionBefore = (0, node_fs_1.readFileSync)(locations.projectionPath);
        const currentnessBefore = (0, node_fs_1.readFileSync)(locations.currentnessPath);
        const candidatePath = node_path_1.default.join(locations.runtimeRoot, "taskmap-refresh-candidate.v1.json");
        const candidateBefore = (0, node_fs_1.readFileSync)(candidatePath);
        const failedAtMs = firstAtMs + 10 * 60 * 1_000;
        const second = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId,
            meetingProducerSnapshotPath: snapshotPath,
            collectors: {
                ...nonMeetingCollectors(),
                meeting_notes: async () => {
                    writeMeetingProducerSnapshot(snapshotPath, {
                        userId: "wrong-owner-after-preflight",
                    });
                    return retainedMeetingSlice;
                },
            },
            nowMs: () => failedAtMs,
        });
        const result = await second.requestRefresh("manual");
        assert.equal(result.refreshStatus, "unavailable");
        assert.equal(result.publicationVerified, false);
        assert.equal(result.publicationBlockReason, "semantic_provider_unavailable");
        assert.deepEqual((0, node_fs_1.readFileSync)(locations.projectionPath), projectionBefore);
        assert.deepEqual((0, node_fs_1.readFileSync)(locations.currentnessPath), currentnessBefore);
        assert.deepEqual((0, node_fs_1.readFileSync)(candidatePath), candidateBefore);
        const failedState = artifact(locations.runtimeRoot, "taskmap-refresh-state.v1.json");
        assert.equal(failedState.lastAttemptAtMs, failedAtMs);
        assert.equal(failedState.lastSuccessfulRefreshAtMs, baselineState.lastSuccessfulRefreshAtMs);
        assert.equal(failedState.lastRefreshStatus, "unavailable");
        assert.equal(failedState.lastPublicationBlockReason, "semantic_provider_unavailable");
        for (const digestName of [
            "verifiedGraphInputDigest",
            "verifiedCandidateDigest",
            "verifiedProjectionDigest",
        ]) {
            assert.equal(failedState[digestName], baselineState[digestName]);
        }
        assert.deepEqual(failedState.sources, baselineState.sources);
        assert.equal(failedState.lastSourceStatuses.find((status) => status.source === "meeting_notes")?.disposition, "unavailable");
        const failedStatus = artifact(locations.runtimeRoot, "taskmap-refresh-status.v1.json");
        assert.equal(failedStatus.refreshStatus, "unavailable");
        assert.equal(failedStatus.publicationBlockReason, "semantic_provider_unavailable");
        assert.equal(failedStatus.failureStage, "graph_builder");
        assert.equal(failedStatus.requestedAtMs, failedAtMs);
        assert.equal(failedStatus.candidateDigest, baselineState.verifiedCandidateDigest);
        assert.equal(failedStatus.projectionDigest, baselineState.verifiedProjectionDigest);
    });
    (0, node_test_1.it)("accepts a predecessor generation written with the legacy locale manifest order", async () => {
        const locations = roots("taskmap-native-legacy-generation-order-");
        const predecessor = rankedExecutablePublicationCandidate();
        writeReferencedPublicationPredecessor(locations.projectionPath, locations.currentnessPath, predecessor, "legacy-generation-order-predecessor");
        rewriteGenerationManifestWithLegacyLocaleOrder(locations.projectionPath);
        const service = new TaskMapNativeRefreshService({
            ...locations,
            collectors: {
                agent_session: async () => {
                    throw new Error("no current agent directive");
                },
                meeting_notes: async () => {
                    throw new Error("no current meeting note");
                },
                calendar: async () => slice("calendar", "legacy-calendar-current"),
                body: async () => slice("body", "legacy-body-current"),
            },
            nowMs: () => Date.parse("2026-08-02T13:59:00.000Z"),
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published");
        assert.equal(result.publicationVerified, true);
        assert.notEqual(result.publicationBlockReason, "publication_failed");
    });
    (0, node_test_1.it)("preserves the exact accepted predecessor when work sources are unavailable", async () => {
        const locations = roots("taskmap-native-context-retirement-");
        const predecessor = rankedExecutablePublicationCandidate();
        writeReferencedPublicationPredecessor(locations.projectionPath, locations.currentnessPath, predecessor, "context-retirement-predecessor");
        assert.ok(predecessor.projection.tasks.length > 0);
        assert.equal((0, node_fs_1.existsSync)(currentWorkPath(locations.projectionPath)), true);
        const noise = slice("agent_session", "accepted-predecessor-noise");
        noise.value.semanticAdmission = task4AgentAdmission([
            task4AgentObservation({
                root: "accepted-predecessor-noise-root",
                route: "/repo/accepted-predecessor",
                turns: [
                    {
                        id: "accepted-predecessor-work-turn",
                        text: "Prepare the accepted release",
                        at: "2026-07-30T07:58:00.000Z",
                    },
                    {
                        id: "accepted-predecessor-stop-turn",
                        text: "stop",
                        at: "2026-07-30T07:59:00.000Z",
                    },
                ],
            }),
        ]);
        noise.sliceDigest = (0, source_contracts_js_1.taskMapContractDigest)(noise.value);
        const contextOnlyCollectors = {
            agent_session: async () => noise,
            meeting_notes: async () => {
                throw new Error("no current meeting note");
            },
            calendar: async () => slice("calendar", "calendar-context-current"),
            body: async () => slice("body", "body-context-current"),
        };
        const refreshedAt = Date.parse("2026-08-02T14:00:00.000Z");
        const refresh = new TaskMapNativeRefreshService({
            ...locations,
            collectors: contextOnlyCollectors,
            nowMs: () => refreshedAt,
        });
        const result = await refresh.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published");
        assert.equal(result.publicationVerified, true);
        const preservedProjection = JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8"));
        assert.deepEqual(preservedProjection, predecessor.projection);
        assert.equal((0, node_fs_1.existsSync)(currentWorkPath(locations.projectionPath)), true);
        const preservedCurrentness = JSON.parse((0, node_fs_1.readFileSync)(locations.currentnessPath, "utf8"));
        assert.deepEqual(preservedCurrentness, {
            ...predecessor.currentness,
            taskDispositions: [
                ...predecessor.currentness.taskDispositions,
            ].sort((left, right) => left.taskId.localeCompare(right.taskId)),
        });
        const preservedRanking = JSON.parse((0, node_fs_1.readFileSync)((0, native_refresh_service_js_1.nativeTaskRankingPath)(locations.projectionPath), "utf8"));
        assert.deepEqual(preservedRanking, predecessor.ranking);
        const restarted = new TaskMapNativeRefreshService({
            ...locations,
            collectors: contextOnlyCollectors,
            nowMs: () => refreshedAt + 1,
        });
        const restartResult = await restarted.requestRefresh("timer");
        assert.equal(restartResult.refreshStatus, "unavailable");
        assert.equal(restartResult.publicationVerified, false);
        assert.deepEqual(JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8")), predecessor.projection);
    });
    (0, node_test_1.it)("retains predecessor on publication failure then recovers the preserved generation", async () => {
        const locations = roots("taskmap-native-context-retirement-crash-");
        const predecessor = rankedExecutablePublicationCandidate();
        const predecessorCurrentWork = writeReferencedPublicationPredecessor(locations.projectionPath, locations.currentnessPath, predecessor, "context-retirement-crash-predecessor");
        const rankingPath = (0, native_refresh_service_js_1.nativeTaskRankingPath)(locations.projectionPath);
        const service = new TaskMapNativeRefreshService({
            ...locations,
            collectors: {
                agent_session: async () => {
                    throw new Error("no current agent directive");
                },
                meeting_notes: async () => {
                    throw new Error("no current meeting note");
                },
                calendar: async () => slice("calendar", "calendar-crash-current"),
                body: async () => slice("body", "body-crash-current"),
            },
            publisher: (input) => (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, node_path_1.default.join(locations.runtimeRoot, "taskmap-publication-journal.v1.json"), input, {
                writeProjection: async () => {
                    throw new Error("injected pre-commit crash");
                },
            }),
            nowMs: () => Date.parse("2026-08-02T14:05:00.000Z"),
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "unavailable");
        assert.equal(result.publicationVerified, false);
        assert.deepEqual(JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8")).tasks, predecessor.projection.tasks);
        assert.equal((0, node_fs_1.existsSync)(rankingPath), true);
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(locations.runtimeRoot, "taskmap-publication-journal.v1.json")), true);
        const restarted = new TaskMapNativeRefreshService({
            ...locations,
            nowMs: () => Date.parse("2026-08-02T14:05:01.000Z"),
        });
        assert.equal(await restarted.recoverPendingPublication(), true);
        const recovered = committedGeneration(locations.projectionPath);
        assert.deepEqual(recovered.projection, predecessor.projection);
        assert.deepEqual(recovered.currentWork, predecessorCurrentWork);
        assert.deepEqual(recovered.ranking, predecessor.ranking);
        assert.equal((0, node_fs_1.existsSync)(currentWorkPath(locations.projectionPath)), true);
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(locations.runtimeRoot, "taskmap-publication-journal.v1.json")), false);
    });
    (0, node_test_1.it)("publishes fresh-empty genesis coverage without inventing work", async () => {
        const locations = roots("taskmap-native-empty-builder-");
        const snapshotPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "meeting-producer-snapshot.v1.json");
        const userId = "owner-empty-test";
        const firstAt = Date.parse("2026-07-29T13:00:00.000Z");
        writeMeetingProducerSnapshot(snapshotPath, {
            userId,
            meetings: [],
        });
        const first = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId: userId,
            meetingProducerSnapshotPath: snapshotPath,
            collectors: nonMeetingCollectors(),
            nowMs: () => firstAt,
        });
        const firstResult = await first.requestRefresh("manual");
        assert.equal(firstResult.refreshStatus, "published");
        assert.equal(firstResult.publicationVerified, true);
        assert.equal(firstResult.publicationBlockReason, null);
        assert.equal((0, node_fs_1.existsSync)(locations.projectionPath), true);
        assert.equal((0, node_fs_1.existsSync)(locations.currentnessPath), true);
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(locations.runtimeRoot, "taskmap-refresh-candidate.v1.json")), true);
        const state = artifact(locations.runtimeRoot, "taskmap-refresh-state.v1.json");
        assert.match(String(state.verifiedGraphInputDigest), /^[a-f0-9]{64}$/);
        assert.match(String(state.verifiedCandidateDigest), /^[a-f0-9]{64}$/);
        assert.match(String(state.verifiedProjectionDigest), /^[a-f0-9]{64}$/);
        assert.match(String(state.verifiedRankingDigest), /^[a-f0-9]{64}$/);
        assert.deepEqual(JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8")).tasks, []);
        const emptyMeetingSlice = state.sources.meeting_notes;
        assert.ok(emptyMeetingSlice);
        const timer = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId: userId,
            meetingProducerSnapshotPath: snapshotPath,
            collectors: nonMeetingCollectors(),
            nowMs: () => firstAt + 60 * 60 * 1_000,
        });
        const timerResult = await timer.requestRefresh("timer");
        assert.equal(timerResult.refreshStatus, "no_op");
        assert.equal(timerResult.publicationVerified, true);
        assert.equal(timerResult.publicationBlockReason, null);
        writeMeetingProducerSnapshot(snapshotPath, {
            userId,
            producedAt: "2026-07-29T13:30:00.000Z",
        });
        const changedAtMs = firstAt + 2 * 60 * 60 * 1_000;
        const changed = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId: userId,
            meetingProducerSnapshotPath: snapshotPath,
            collectors: nonMeetingCollectors(),
            nowMs: () => changedAtMs,
        });
        const changedResult = await changed.requestRefresh("timer");
        assert.equal(changedResult.refreshStatus, "published", JSON.stringify(changedResult));
        assert.equal(changedResult.publicationVerified, true);
        const projection = JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8"));
        assert.equal(projection.tasks.length, 1);
        const changedState = artifact(locations.runtimeRoot, "taskmap-refresh-state.v1.json");
        assert.equal(changedState.lastSuccessfulRefreshAtMs, changedAtMs);
        const changedMeetingSlice = changedState.sources.meeting_notes;
        assert.ok(changedMeetingSlice);
        assert.notEqual(changedMeetingSlice.revision, emptyMeetingSlice.revision);
        assert.equal(changedMeetingSlice.sliceDigest, emptyMeetingSlice.sliceDigest);
    });
    (0, node_test_1.it)("retires a valid fixed predecessor without requiring its retired source evidence", async () => {
        const locations = roots("taskmap-native-default-predecessor-");
        const predecessor = publicationCandidate(18, projectionWithTaskCount(27));
        (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(locations.projectionPath), {
            recursive: true,
            mode: 0o700,
        });
        (0, node_fs_1.writeFileSync)(locations.projectionPath, `${JSON.stringify(predecessor.projection)}\n`, { mode: 0o600 });
        (0, node_fs_1.writeFileSync)(locations.currentnessPath, `${JSON.stringify(predecessor.currentness)}\n`, { mode: 0o600 });
        const projectionBefore = (0, node_fs_1.readFileSync)(locations.projectionPath);
        const currentnessBefore = (0, node_fs_1.readFileSync)(locations.currentnessPath);
        const snapshotPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "meeting-producer-snapshot.v1.json");
        const userId = "owner-predecessor-test";
        writeMeetingProducerSnapshot(snapshotPath, {
            userId,
            meetings: [
                meetingProducerMeeting("single-document", "2026-07-28T09:00:00.000Z"),
            ],
        });
        const service = new TaskMapNativeRefreshService({
            ...locations,
            ownerUserId: userId,
            meetingProducerSnapshotPath: snapshotPath,
            collectors: nonMeetingCollectors(),
            nowMs: () => Date.parse("2026-07-29T13:00:00.000Z"),
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published");
        assert.equal(result.publicationVerified, true);
        assert.equal(result.publicationBlockReason, null);
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(locations.runtimeRoot, "taskmap-refresh-candidate.v1.json")), true);
        assert.notDeepEqual((0, node_fs_1.readFileSync)(locations.projectionPath), projectionBefore);
        assert.notDeepEqual((0, node_fs_1.readFileSync)(locations.currentnessPath), currentnessBefore);
        const retiredProjection = JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8"));
        assert.deepEqual(retiredProjection.tasks, []);
        const retiredCurrentness = JSON.parse((0, node_fs_1.readFileSync)(locations.currentnessPath, "utf8"));
        assert.deepEqual(retiredCurrentness.taskDispositions, []);
    });
    (0, node_test_1.it)("preserves non-Agent work when a fresh Meeting producer changes to empty", async () => {
        for (const trigger of ["timer", "launch"]) {
            const locations = roots(`taskmap-native-fresh-empty-${trigger}-`);
            const snapshotPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "meeting-producer-snapshot.v1.json");
            const userId = `owner-fresh-empty-${trigger}`;
            const firstAtMs = Date.parse("2026-07-29T13:00:00.000Z");
            writeMeetingProducerSnapshot(snapshotPath, { userId });
            const first = new TaskMapNativeRefreshService({
                ...locations,
                ownerUserId: userId,
                meetingProducerSnapshotPath: snapshotPath,
                collectors: nonMeetingCollectors(),
                nowMs: () => firstAtMs,
            });
            assert.equal((await first.requestRefresh("manual")).refreshStatus, "published");
            const projectionBefore = (0, node_fs_1.readFileSync)(locations.projectionPath);
            const currentnessBefore = (0, node_fs_1.readFileSync)(locations.currentnessPath);
            const rankingBefore = (0, node_fs_1.readFileSync)((0, native_refresh_service_js_1.nativeTaskRankingPath)(locations.projectionPath));
            const candidatePath = node_path_1.default.join(locations.runtimeRoot, "taskmap-refresh-candidate.v1.json");
            const candidateBefore = (0, node_fs_1.readFileSync)(candidatePath);
            writeMeetingProducerSnapshot(snapshotPath, {
                userId,
                producedAt: "2026-07-29T13:05:00.000Z",
                meetings: [],
            });
            const changed = new TaskMapNativeRefreshService({
                ...locations,
                ownerUserId: userId,
                meetingProducerSnapshotPath: snapshotPath,
                collectors: nonMeetingCollectors(),
                nowMs: () => firstAtMs + 10 * 60 * 1_000,
            });
            const result = await changed.requestRefresh(trigger);
            assert.equal(result.refreshStatus, "published");
            assert.equal(result.publicationVerified, true);
            assert.equal(result.publicationBlockReason, null);
            assert.deepEqual((0, node_fs_1.readFileSync)(locations.projectionPath), projectionBefore);
            assert.deepEqual((0, node_fs_1.readFileSync)(locations.currentnessPath), currentnessBefore);
            assert.deepEqual((0, node_fs_1.readFileSync)((0, native_refresh_service_js_1.nativeTaskRankingPath)(locations.projectionPath)), rankingBefore);
            assert.notDeepEqual((0, node_fs_1.readFileSync)(candidatePath), candidateBefore);
            const preservedProjection = JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8"));
            assert.ok(preservedProjection.tasks.length > 0);
            assert.equal(preservedProjection.sources.every((source) => source.sourceKind === "gemini_meet"), true);
        }
    });
    (0, node_test_1.it)("preserves the accepted pair for stale or wrong-owner default evidence", async () => {
        for (const scenario of ["stale", "wrong_owner"]) {
            const locations = roots(`taskmap-native-default-${scenario}-`);
            const predecessor = publicationCandidate();
            (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(locations.projectionPath), {
                recursive: true,
                mode: 0o700,
            });
            (0, node_fs_1.writeFileSync)(locations.projectionPath, `${JSON.stringify(predecessor.projection)}\n`, { mode: 0o600 });
            (0, node_fs_1.writeFileSync)(locations.currentnessPath, `${JSON.stringify(predecessor.currentness)}\n`, { mode: 0o600 });
            const projectionBefore = (0, node_fs_1.readFileSync)(locations.projectionPath);
            const currentnessBefore = (0, node_fs_1.readFileSync)(locations.currentnessPath);
            const snapshotPath = node_path_1.default.join(node_path_1.default.dirname(locations.runtimeRoot), "meeting-producer-snapshot.v1.json");
            const expectedUserId = `expected-${scenario}`;
            writeMeetingProducerSnapshot(snapshotPath, {
                userId: scenario === "wrong_owner"
                    ? "different-owner"
                    : expectedUserId,
            });
            const service = new TaskMapNativeRefreshService({
                ...locations,
                ownerUserId: expectedUserId,
                meetingProducerSnapshotPath: snapshotPath,
                collectors: nonMeetingCollectors(),
                nowMs: () => Date.parse(scenario === "stale"
                    ? "2026-07-29T16:00:00.000Z"
                    : "2026-07-29T13:00:00.000Z"),
            });
            const result = await service.requestRefresh("manual");
            assert.equal(result.refreshStatus, "unavailable");
            assert.equal(result.publicationBlockReason, "semantic_provider_unavailable");
            assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(locations.runtimeRoot, "taskmap-refresh-candidate.v1.json")), false);
            assert.deepEqual((0, node_fs_1.readFileSync)(locations.projectionPath), projectionBefore);
            assert.deepEqual((0, node_fs_1.readFileSync)(locations.currentnessPath), currentnessBefore);
        }
    });
    (0, node_test_1.it)("runs one barrier, publishes a loader-compatible gated projection, and records verified digests", async () => {
        const locations = roots("taskmap-native-published-");
        let graphRecordCount = 0;
        const duplicateIdentity = "same-native-identity";
        const candidate = publicationCandidate();
        const service = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(undefined, {
                meeting_notes: async () => slice("meeting_notes", "meeting-r1", duplicateIdentity),
                calendar: async () => slice("calendar", "calendar-r1", duplicateIdentity),
            }),
            graphBuilder: async (barrier) => {
                graphRecordCount = barrier.graphInput.sources.reduce((total, source) => total + (source.value?.records.length ?? 0), 0);
                return {
                    candidateDigest: digest(candidate),
                    candidate: candidate,
                };
            },
            nowMs: () => 2_000,
        });
        const result = await service.requestRefresh("launch");
        assert.equal(result.status, "ok");
        assert.equal(result.refreshStatus, "published");
        assert.equal(result.publicationVerified, true);
        assert.equal(result.publicationBlockReason, null);
        assert.equal(graphRecordCount, 3);
        assert.deepEqual(JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8")), candidate.projection);
        const staged = artifact(locations.runtimeRoot, "taskmap-refresh-candidate.v1.json");
        assert.equal(staged.contractVersion, native_refresh_service_js_1.TASKMAP_NATIVE_REFRESH_CANDIDATE_VERSION);
        const state = artifact(locations.runtimeRoot, "taskmap-refresh-state.v1.json");
        assert.equal(state.lastRefreshStatus, "published");
        assert.equal(state.verifiedCandidateDigest, digest(candidate));
        assert.equal((0, node_fs_1.statSync)(locations.projectionPath).mode & 0o777, 0o600);
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(locations.runtimeRoot, "taskmap-publication-journal.v1.json")), false);
    });
    (0, node_test_1.it)("publishes a deterministic current-work successor without changing its work semantics", async () => {
        const locations = roots("taskmap-native-current-work-success-");
        const predecessor = publicationCandidate();
        const predecessorCurrentWork = writeReferencedPublicationPredecessor(locations.projectionPath, locations.currentnessPath, predecessor, "current-work-success-predecessor");
        const episodeAdmission = {
            admission: "authenticated_fresh_agent_session",
            directive: "user_directive",
            userDirectiveSummary: "Prepare the customer launch checklist",
            episodeId: "tmaepisode_250aeaa278a0c4ff",
            episodeIdentityDigest: "8e5662d48cbe05f044bfb131d20576fbe2bb4123cc87def83a3f1dd556858770",
            episodeRevisionDigest: "16f62b4e49440b9421ab2668a7097469a71bf414eb39eaed39745ab6f3fb84e3",
            rootSessionIdentityDigest: "2cf7c9ea0e7c80d88db5de9e0817297160275a1d485b2b54345aeaa0ac4246f3",
            occurredAt: "2026-07-30T22:06:04.957Z",
            provider: "codex",
            routingIdentityKind: "repository",
            routingIdentityDigest: "b1c787fae927b1596fc69ff6fcbd1ab34e640aac7133a01f33fc273e1f22de2b",
            completionAuthority: false,
            reopenAuthority: false,
        };
        const candidate = {
            ...publicationCandidate(0, successorProjection(predecessor.projection)),
            agentSessionEpisode: episodeAdmission,
        };
        const service = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: graphBuilder(candidate),
            nowMs: () => 2_200,
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published");
        assert.equal(result.publicationVerified, true);
        assert.equal(result.publicationBlockReason, null);
        const bytes = (0, node_fs_1.readFileSync)(currentWorkPath(locations.projectionPath));
        const currentWork = JSON.parse(bytes.toString("utf8"));
        assert.equal(bytes.toString("utf8"), (0, source_contracts_js_1.taskMapContractCanonicalJson)(currentWork));
        const predecessorSemantics = structuredClone(predecessorCurrentWork);
        const successorSemantics = structuredClone(currentWork);
        delete predecessorSemantics.projection;
        delete predecessorSemantics.artifactDigest;
        delete successorSemantics.projection;
        delete successorSemantics.artifactDigest;
        const successorInput = successorSemantics.nextTaskToProve
            .input;
        assert.deepEqual(successorInput.agentSessionEpisode, episodeAdmission);
        delete successorInput.agentSessionEpisode;
        assert.deepEqual(successorSemantics, predecessorSemantics);
        assert.deepEqual(currentWork.projection, {
            contractVersion: candidate.projection.contractVersion,
            runId: candidate.projection.runId,
            inputDigest: candidate.projection.inputDigest,
            generatedAt: candidate.projection.generatedAt,
            projectionDigest: candidate.currentness.projectionDigest,
        });
        const digestCore = structuredClone(currentWork);
        delete digestCore.artifactDigest;
        assert.equal(currentWork.artifactDigest, (0, source_contracts_js_1.taskMapContractDigest)(digestCore));
        assert.equal((0, node_fs_1.statSync)(currentWorkPath(locations.projectionPath)).mode & 0o777, 0o600);
        const withoutDirective = publicationCandidate(0, successorProjection(candidate.projection));
        const nextRefresh = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(undefined, {
                agent_session: async () => slice("agent_session", "agent-session-without-directive-r2"),
            }),
            graphBuilder: graphBuilder(withoutDirective),
            nowMs: () => 2_300,
        });
        const nextResult = await nextRefresh.requestRefresh("manual");
        assert.equal(nextResult.refreshStatus, "published");
        const withoutAdmission = JSON.parse((0, node_fs_1.readFileSync)(currentWorkPath(locations.projectionPath), "utf8"));
        assert.equal(Object.prototype.hasOwnProperty.call(withoutAdmission.nextTaskToProve.input, "agentSessionEpisode"), false);
    });
    (0, node_test_1.it)("derives every structurally eligible proof-backed leaf from a legacy singleton companion", async () => {
        const locations = roots("taskmap-native-ready-proof-targets-");
        const predecessor = publicationCandidate();
        const firstCurrentWork = currentWorkForProjection(predecessor.projection);
        const firstTaskId = firstCurrentWork.nextTaskToProve.taskId;
        writeReferencedPublicationPredecessor(locations.projectionPath, locations.currentnessPath, predecessor, "multiple-ready-predecessor");
        const predecessorProofTargets = (0, ready_frontier_js_1.validateTaskMapReadyProofTargets)(JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(node_path_1.default.dirname(locations.projectionPath), native_refresh_service_js_1.TASKMAP_NATIVE_GENERATIONS_DIRECTORY, digest(predecessor), "taskmap-ready-proof-targets.v1.json"), "utf8")), predecessor.projection, predecessor.currentness);
        assert.deepEqual(predecessorProofTargets.proofTargets.map((target) => target.taskId), [firstTaskId]);
        const candidate = publicationCandidate(0, successorProjection(predecessor.projection));
        const service = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: graphBuilder(candidate),
            nowMs: () => 2_305,
        });
        const independentlyEligibleTaskIds = candidate.projection.tasks
            .filter((task) => /^tmt_/.test(task.id)
            && task.reviewState === "accepted"
            && task.openState === "open"
            && candidate.currentness.taskDispositions.some((row) => row.taskId === task.id && row.disposition === "current")
            && task.sourceStatus === "open"
            && task.authority !== "none"
            && task.returnRoute.state !== "user_destination_required")
            .map((task) => task.id)
            .sort();
        assert.ok(independentlyEligibleTaskIds.length > 2);
        assert.ok(independentlyEligibleTaskIds.includes(firstTaskId));
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published");
        const generation = committedGeneration(locations.projectionPath);
        assert.ok(generation.readyProofTargets);
        const verified = (0, ready_frontier_js_1.validateTaskMapReadyProofTargets)(generation.readyProofTargets, candidate.projection, candidate.currentness);
        assert.deepEqual(verified.proofTargets.map((target) => target.taskId), independentlyEligibleTaskIds);
        assert.deepEqual(verified.proofTargets.find((target) => target.taskId === firstTaskId), readyProofTargetFromCurrentWorkFixture(firstCurrentWork));
        assert.ok(generation.ranking);
        assert.deepEqual(generation.ranking.rankedAcceptedOpen
            .map((row) => row.taskId)
            .sort(), independentlyEligibleTaskIds);
        const fixed = (0, ready_frontier_js_1.validateTaskMapReadyProofTargets)(JSON.parse((0, node_fs_1.readFileSync)((0, native_refresh_service_js_1.taskMapNativeReadyProofTargetsPath)(locations.projectionPath), "utf8")), candidate.projection, candidate.currentness);
        assert.deepEqual(fixed, verified);
        const manifest = JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(node_path_1.default.dirname(locations.projectionPath), native_refresh_service_js_1.TASKMAP_NATIVE_GENERATIONS_DIRECTORY, generation.generationId, native_refresh_service_js_1.TASKMAP_NATIVE_GENERATION_MANIFEST_FILENAME), "utf8"));
        assert.deepEqual(Object.keys(manifest.artifacts).sort(), ["currentWork", "currentness", "projection", "ranking"]);
    });
    (0, node_test_1.it)("publishes zero ready leaves when the predecessor generation companion is missing", async () => {
        const locations = roots("taskmap-native-ready-proof-missing-");
        const predecessor = publicationCandidate();
        writeReferencedPublicationPredecessor(locations.projectionPath, locations.currentnessPath, predecessor, "missing-ready-predecessor");
        (0, node_fs_1.rmSync)(node_path_1.default.join(node_path_1.default.dirname(locations.projectionPath), native_refresh_service_js_1.TASKMAP_NATIVE_GENERATIONS_DIRECTORY, digest(predecessor), "taskmap-ready-proof-targets.v1.json"));
        const candidate = publicationCandidate(0, successorProjection(predecessor.projection));
        const service = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: graphBuilder(candidate),
            nowMs: () => 2_306,
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published");
        const generation = committedGeneration(locations.projectionPath);
        assert.ok(generation.currentWork);
        assert.ok(generation.readyProofTargets);
        assert.deepEqual(generation.readyProofTargets.proofTargets, []);
        const fixed = (0, ready_frontier_js_1.validateTaskMapReadyProofTargets)(JSON.parse((0, node_fs_1.readFileSync)((0, native_refresh_service_js_1.taskMapNativeReadyProofTargetsPath)(locations.projectionPath), "utf8")), candidate.projection, candidate.currentness);
        assert.deepEqual(fixed.proofTargets, []);
    });
    (0, node_test_1.it)("publishes zero ready leaves when a generation companion has a valid seal for the wrong binding", async () => {
        const locations = roots("taskmap-native-ready-proof-binding-");
        const predecessor = publicationCandidate();
        const predecessorCurrentWork = writeReferencedPublicationPredecessor(locations.projectionPath, locations.currentnessPath, predecessor, "mismatched-ready-predecessor");
        const taskId = predecessorCurrentWork.nextTaskToProve.taskId;
        const candidate = publicationCandidate(0, successorProjection(predecessor.projection));
        const wrongBinding = readyProofTargetsFixture(candidate, [taskId]);
        (0, node_fs_1.writeFileSync)(node_path_1.default.join(node_path_1.default.dirname(locations.projectionPath), native_refresh_service_js_1.TASKMAP_NATIVE_GENERATIONS_DIRECTORY, digest(predecessor), "taskmap-ready-proof-targets.v1.json"), (0, source_contracts_js_1.taskMapContractCanonicalJson)(wrongBinding), { mode: 0o600 });
        const service = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: graphBuilder(candidate),
            nowMs: () => 2_307,
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published");
        const generation = committedGeneration(locations.projectionPath);
        assert.ok(generation.readyProofTargets);
        assert.deepEqual(generation.readyProofTargets.proofTargets, []);
    });
    (0, node_test_1.it)("seeds first publication with the complete eligible frontier instead of a singleton fallback", async () => {
        const locations = roots("taskmap-native-ready-proof-no-fallback-");
        const candidate = publicationCandidate();
        const independentlyEligibleTaskIds = candidate.projection.tasks
            .filter((task) => /^tmt_/.test(task.id)
            && task.reviewState === "accepted"
            && task.openState === "open"
            && candidate.currentness.taskDispositions.some((row) => row.taskId === task.id && row.disposition === "current")
            && task.sourceStatus === "open"
            && task.authority !== "none"
            && task.returnRoute.state !== "user_destination_required")
            .map((task) => task.id)
            .sort();
        assert.ok(independentlyEligibleTaskIds.length > 1);
        const service = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: graphBuilder(candidate),
            nowMs: () => 2_308,
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published");
        const generation = committedGeneration(locations.projectionPath);
        assert.ok(generation.ranking);
        assert.ok(generation.ranking.rankedAcceptedOpen.length > 0);
        assert.ok(generation.currentWork);
        const firstRanked = generation.ranking.rankedAcceptedOpen[0];
        assert.ok(firstRanked);
        const nextTaskToProve = generation.currentWork.nextTaskToProve;
        assert.equal(nextTaskToProve.taskId, firstRanked.taskId);
        const selectedTask = candidate.projection.tasks.find((task) => task.id === firstRanked.taskId);
        assert.ok(selectedTask);
        const selectedRoot = candidate.projection.roots.find((root) => root.id === selectedTask.rootId);
        assert.ok(selectedRoot);
        assert.deepEqual(generation.currentWork.currentGoal, {
            rootId: selectedRoot.id,
            title: selectedRoot.title,
            accepted: true,
        });
        assert.equal(nextTaskToProve.outcome, selectedTask.title);
        assert.equal(nextTaskToProve.input.summary, selectedTask.summary);
        assert.deepEqual(nextTaskToProve.doneDefinition, [selectedTask.summary]);
        assert.ok(generation.readyProofTargets);
        const verified = (0, ready_frontier_js_1.validateTaskMapReadyProofTargets)(generation.readyProofTargets, candidate.projection, candidate.currentness);
        assert.deepEqual(verified.proofTargets.map((target) => target.taskId).sort(), independentlyEligibleTaskIds);
        assert.deepEqual(verified.proofTargets.find((target) => target.taskId === firstRanked.taskId), readyProofTargetFromCurrentWorkFixture(generation.currentWork));
        const fixed = (0, ready_frontier_js_1.validateTaskMapReadyProofTargets)(JSON.parse((0, node_fs_1.readFileSync)((0, native_refresh_service_js_1.taskMapNativeReadyProofTargetsPath)(locations.projectionPath), "utf8")), candidate.projection, candidate.currentness);
        assert.deepEqual(fixed, verified);
    });
    (0, node_test_1.it)("preserves the exact last-good trio when the current-work target disappears", async () => {
        const locations = roots("taskmap-native-current-work-missing-");
        const predecessor = publicationCandidate();
        const predecessorCurrentWork = writeReferencedPublicationPredecessor(locations.projectionPath, locations.currentnessPath, predecessor, "current-work-missing-predecessor");
        const targetTaskId = predecessorCurrentWork.nextTaskToProve.taskId;
        const projection = successorProjection(predecessor.projection);
        projection.tasks = projection.tasks.filter((task) => task.id !== targetTaskId);
        projection.roots = projection.roots.map((root) => ({
            ...root,
            taskIds: root.taskIds.filter((taskId) => taskId !== targetTaskId),
        }));
        projection.edges = projection.edges.filter((edge) => edge.from !== targetTaskId && edge.to !== targetTaskId);
        const candidate = publicationCandidate(0, projection);
        const before = {
            projection: (0, node_fs_1.readFileSync)(locations.projectionPath),
            currentness: (0, node_fs_1.readFileSync)(locations.currentnessPath),
            currentWork: (0, node_fs_1.readFileSync)(currentWorkPath(locations.projectionPath)),
        };
        const service = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: graphBuilder(candidate),
            nowMs: () => 2_210,
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "unavailable");
        assert.equal(result.publicationBlockReason, "predecessor_continuity_required");
        assert.deepEqual((0, node_fs_1.readFileSync)(locations.projectionPath), before.projection);
        assert.deepEqual((0, node_fs_1.readFileSync)(locations.currentnessPath), before.currentness);
        assert.deepEqual((0, node_fs_1.readFileSync)(currentWorkPath(locations.projectionPath)), before.currentWork);
    });
    (0, node_test_1.it)("retains the predecessor trio on failure then recovers the successor generation", async () => {
        const locations = roots("taskmap-native-current-work-write-");
        const predecessor = publicationCandidate();
        writeReferencedPublicationPredecessor(locations.projectionPath, locations.currentnessPath, predecessor, "current-work-write-predecessor");
        const candidate = publicationCandidate(0, successorProjection(predecessor.projection));
        const before = {
            projection: (0, node_fs_1.readFileSync)(locations.projectionPath),
            currentness: (0, node_fs_1.readFileSync)(locations.currentnessPath),
            currentWork: (0, node_fs_1.readFileSync)(currentWorkPath(locations.projectionPath)),
        };
        let currentWorkWriteCalls = 0;
        const service = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: graphBuilder(candidate),
            publisher: (input) => (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, node_path_1.default.join(locations.runtimeRoot, "taskmap-publication-journal.v1.json"), input, {
                writeCurrentWork: async () => {
                    currentWorkWriteCalls += 1;
                    throw new Error("injected current-work write failure");
                },
            }),
            nowMs: () => 2_220,
        });
        const result = await service.requestRefresh("manual");
        assert.equal(currentWorkWriteCalls, 1);
        assert.equal(result.refreshStatus, "unavailable");
        assert.equal(result.publicationVerified, false);
        assert.deepEqual((0, node_fs_1.readFileSync)(locations.projectionPath), before.projection);
        assert.deepEqual((0, node_fs_1.readFileSync)(locations.currentnessPath), before.currentness);
        assert.deepEqual((0, node_fs_1.readFileSync)(currentWorkPath(locations.projectionPath)), before.currentWork);
        const restarted = new TaskMapNativeRefreshService({
            ...locations,
            nowMs: () => 2_221,
        });
        assert.equal(await restarted.recoverPendingPublication(), true);
        assert.deepEqual(committedGeneration(locations.projectionPath).projection, candidate.projection);
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(locations.runtimeRoot, "taskmap-publication-journal.v1.json")), false);
    });
    (0, node_test_1.it)("retains the verified predecessor when a successor ranking write fails", async () => {
        const locations = roots("taskmap-native-ranking-write-");
        const baseline = rankedPublicationCandidate();
        await (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, node_path_1.default.join(locations.runtimeRoot, "baseline-ranking-journal.json"), {
            graphInputDigest: digest("baseline-ranking-graph"),
            candidateDigest: digest(baseline),
            candidate: baseline,
            requestedAtMs: 2_225,
            expectedOwnerScopeDigest: TEST_OWNER_SCOPE.ownerScopeDigest,
        });
        const rankingPath = (0, native_refresh_service_js_1.nativeTaskRankingPath)(locations.projectionPath);
        const before = {
            projection: (0, node_fs_1.readFileSync)(locations.projectionPath),
            currentness: (0, node_fs_1.readFileSync)(locations.currentnessPath),
            ranking: (0, node_fs_1.readFileSync)(rankingPath),
            reference: (0, node_fs_1.readFileSync)((0, native_refresh_service_js_1.nativeTaskMapGenerationReferencePath)(locations.projectionPath)),
        };
        const candidate = rankedPublicationCandidate(successorProjection(baseline.projection));
        const failedJournal = node_path_1.default.join(locations.runtimeRoot, "failed-ranking-journal.json");
        await assert.rejects((0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, failedJournal, {
            graphInputDigest: digest("candidate-ranking-graph"),
            candidateDigest: digest(candidate),
            candidate: candidate,
            requestedAtMs: 2_226,
            expectedOwnerScopeDigest: TEST_OWNER_SCOPE.ownerScopeDigest,
        }, {
            writeRanking: async () => {
                throw new Error("injected ranking write failure");
            },
        }), /injected ranking write failure/);
        assert.deepEqual((0, node_fs_1.readFileSync)(locations.projectionPath), before.projection);
        assert.deepEqual((0, node_fs_1.readFileSync)(locations.currentnessPath), before.currentness);
        assert.deepEqual((0, node_fs_1.readFileSync)(rankingPath), before.ranking);
        assert.deepEqual((0, node_fs_1.readFileSync)((0, native_refresh_service_js_1.nativeTaskMapGenerationReferencePath)(locations.projectionPath)), before.reference);
        assert.deepEqual(committedGeneration(locations.projectionPath).projection, baseline.projection);
        assert.equal((0, node_fs_1.existsSync)(failedJournal), true);
        (0, node_fs_1.rmSync)(failedJournal);
    });
    (0, node_test_1.it)("retains one verified generation across every transient publication fault point", async () => {
        const stages = [
            "currentness",
            "current-work",
            "ready-proof-targets",
            "ranking",
            "projection",
        ];
        for (const stage of stages) {
            const locations = roots(`taskmap-native-atomic-${stage}-`);
            const ranked = stage !== "current-work";
            const baseline = ranked
                ? rankedPublicationCandidate()
                : publicationCandidate();
            const baselineJournal = node_path_1.default.join(locations.runtimeRoot, `baseline-${stage}.json`);
            if (ranked) {
                await (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, baselineJournal, ownerBoundPublicationInput(baseline, TEST_OWNER_SCOPE.ownerScopeDigest, `baseline-${stage}`));
            }
            else {
                writeReferencedPublicationPredecessor(locations.projectionPath, locations.currentnessPath, baseline, `baseline-${stage}`);
            }
            const companionPaths = [
                locations.projectionPath,
                locations.currentnessPath,
                (0, native_refresh_service_js_1.taskMapNativeReadyProofTargetsPath)(locations.projectionPath),
                ...(ranked
                    ? [(0, native_refresh_service_js_1.nativeTaskRankingPath)(locations.projectionPath)]
                    : [currentWorkPath(locations.projectionPath)]),
            ];
            const before = new Map(companionPaths.map((filePath) => [filePath, (0, node_fs_1.readFileSync)(filePath)]));
            const referencePath = (0, native_refresh_service_js_1.nativeTaskMapGenerationReferencePath)(locations.projectionPath);
            const referenceBefore = (0, node_fs_1.existsSync)(referencePath)
                ? (0, node_fs_1.readFileSync)(referencePath)
                : null;
            const successorProjectionValue = successorProjection(baseline.projection);
            const successor = ranked
                ? rankedPublicationCandidate(successorProjectionValue)
                : publicationCandidate(0, successorProjectionValue);
            const failedJournal = node_path_1.default.join(locations.runtimeRoot, `failed-${stage}.json`);
            const fail = async () => {
                throw new Error(`injected ${stage} write failure`);
            };
            const dependencies = {
                currentness: { writeCurrentness: fail },
                "current-work": { writeCurrentWork: fail },
                "ready-proof-targets": { writeReadyProofTargets: fail },
                ranking: { writeRanking: fail },
                projection: { writeProjection: fail },
            };
            await assert.rejects((0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, failedJournal, ownerBoundPublicationInput(successor, TEST_OWNER_SCOPE.ownerScopeDigest, `successor-${stage}`), dependencies[stage]), new RegExp(`injected ${stage} write failure`));
            for (const filePath of companionPaths) {
                assert.deepEqual((0, node_fs_1.readFileSync)(filePath), before.get(filePath), `${stage} failure must preserve every predecessor compatibility file`);
            }
            assert.deepEqual((0, node_fs_1.existsSync)(referencePath) ? (0, node_fs_1.readFileSync)(referencePath) : null, referenceBefore);
            assert.equal((0, node_fs_1.existsSync)(failedJournal), true);
            (0, node_fs_1.rmSync)(failedJournal);
        }
    });
    (0, node_test_1.it)("rejects a rankingless successor without mutating a ranked predecessor bundle", async () => {
        const locations = roots("taskmap-native-ranked-to-unranked-");
        const baseline = rankedPublicationCandidate();
        await (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, node_path_1.default.join(locations.runtimeRoot, "baseline-ranked-journal.json"), ownerBoundPublicationInput(baseline, TEST_OWNER_SCOPE.ownerScopeDigest, "baseline-ranked"));
        const rankingPath = (0, native_refresh_service_js_1.nativeTaskRankingPath)(locations.projectionPath);
        const before = {
            projection: (0, node_fs_1.readFileSync)(locations.projectionPath),
            currentness: (0, node_fs_1.readFileSync)(locations.currentnessPath),
            ranking: (0, node_fs_1.readFileSync)(rankingPath),
        };
        const successor = rankinglessPublicationCandidate(0, successorProjection(baseline.projection));
        const journalPath = node_path_1.default.join(locations.runtimeRoot, "rankingless-successor-journal.json");
        await assert.rejects(() => (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, journalPath, ownerBoundPublicationInput(successor, TEST_OWNER_SCOPE.ownerScopeDigest, "rankingless-successor")), /loader_incompatible/);
        assert.deepEqual((0, node_fs_1.readFileSync)(locations.projectionPath), before.projection);
        assert.deepEqual((0, node_fs_1.readFileSync)(locations.currentnessPath), before.currentness);
        assert.deepEqual((0, node_fs_1.readFileSync)(rankingPath), before.ranking);
        assert.equal((0, node_fs_1.existsSync)(journalPath), false);
        const rankedSuccessor = rankedPublicationCandidate(successorProjection(baseline.projection));
        await (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, node_path_1.default.join(locations.runtimeRoot, "recovered-ranked-journal.json"), ownerBoundPublicationInput(rankedSuccessor, TEST_OWNER_SCOPE.ownerScopeDigest, "recovered-ranked-successor"));
        assert.deepEqual(JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8")), rankedSuccessor.projection);
        const recoveredCurrentness = JSON.parse((0, node_fs_1.readFileSync)(locations.currentnessPath, "utf8"));
        assert.deepEqual({
            ...recoveredCurrentness,
            taskDispositions: [...recoveredCurrentness.taskDispositions].sort((left, right) => left.taskId.localeCompare(right.taskId)),
        }, {
            ...rankedSuccessor.currentness,
            taskDispositions: [...rankedSuccessor.currentness.taskDispositions]
                .sort((left, right) => left.taskId.localeCompare(right.taskId)),
        });
        assert.deepEqual(JSON.parse((0, node_fs_1.readFileSync)(rankingPath, "utf8")), rankedSuccessor.ranking);
    });
    (0, node_test_1.it)("never references a first owner generation without ranking", async () => {
        const locations = roots("taskmap-native-first-ranking-required-");
        const candidate = rankinglessPublicationCandidate();
        const journalPath = node_path_1.default.join(locations.runtimeRoot, "first-rankingless-journal.json");
        await assert.rejects(() => (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, journalPath, ownerBoundPublicationInput(candidate, TEST_OWNER_SCOPE.ownerScopeDigest, "first-rankingless-owner-generation")), /loader_incompatible/);
        assert.equal((0, node_fs_1.existsSync)((0, native_refresh_service_js_1.nativeTaskMapGenerationReferencePath)(locations.projectionPath)), false);
        assert.equal((0, node_fs_1.existsSync)(journalPath), false);
    });
    (0, node_test_1.it)("never recovers a rankingless journal into an owner generation", async () => {
        const locations = roots("taskmap-native-recovery-ranking-required-");
        const candidate = rankinglessPublicationCandidate();
        const journalPath = node_path_1.default.join(locations.runtimeRoot, "taskmap-publication-journal.v1.json");
        (0, node_fs_1.mkdirSync)(locations.runtimeRoot, { recursive: true, mode: 0o700 });
        (0, node_fs_1.writeFileSync)(journalPath, `${JSON.stringify({
            contractVersion: "taskmap-native-publication-journal.v2",
            graphInputDigest: digest("rankingless-recovery-graph"),
            candidateDigest: digest(candidate),
            requestedAtMs: 2_240,
            candidateProjectionDigest: (0, source_contracts_js_1.diffTaskMapProjections)(null, candidate.projection).currentProjectionDigest,
            candidate: candidate,
            previousCurrentness: null,
            candidateCurrentWork: null,
            previousCurrentWork: null,
        }, null, 2)}\n`, { mode: 0o600 });
        const service = new TaskMapNativeRefreshService({
            ...locations,
            nowMs: () => 2_241,
        });
        await assert.rejects(() => service.recoverPendingPublication(), /ranking|publication|loader/i);
        assert.equal((0, node_fs_1.existsSync)((0, native_refresh_service_js_1.nativeTaskMapGenerationReferencePath)(locations.projectionPath)), false);
    });
    (0, node_test_1.it)("ignores a missing compatibility ranking mirror when the generation is verified", async () => {
        const locations = roots("taskmap-native-ranking-missing-");
        const candidate = rankedPublicationCandidate();
        let now = 2_230;
        const service = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: graphBuilder(candidate),
            nowMs: () => now,
        });
        const published = await service.requestRefresh("manual");
        assert.equal(published.refreshStatus, "published");
        const stateAfterPublish = artifact(locations.runtimeRoot, "taskmap-refresh-state.v1.json");
        assert.equal(stateAfterPublish.verifiedRankingDigest, candidate.ranking.artifactDigest);
        (0, node_fs_1.rmSync)((0, native_refresh_service_js_1.nativeTaskRankingPath)(locations.projectionPath));
        now += 1;
        const missing = await service.requestRefresh("timer");
        assert.equal(missing.refreshStatus, "no_op");
        assert.equal(missing.publicationVerified, true);
        assert.equal(missing.publicationBlockReason, null);
    });
    (0, node_test_1.it)("ignores hostile compatibility ranking mirrors and advances from the verified generation", async () => {
        for (const variant of ["pretty", "duplicate"]) {
            const locations = roots(`taskmap-native-ranking-${variant}-`);
            const baseline = rankedPublicationCandidate();
            await (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, node_path_1.default.join(locations.runtimeRoot, `baseline-${variant}.json`), {
                graphInputDigest: digest(`baseline-${variant}-graph`),
                candidateDigest: digest(baseline),
                candidate: baseline,
                requestedAtMs: 2_235,
                expectedOwnerScopeDigest: TEST_OWNER_SCOPE.ownerScopeDigest,
            });
            const rankingPath = (0, native_refresh_service_js_1.nativeTaskRankingPath)(locations.projectionPath);
            const canonical = (0, source_contracts_js_1.taskMapContractCanonicalJson)(baseline.ranking);
            const hostileBytes = variant === "pretty"
                ? `${JSON.stringify(baseline.ranking, null, 2)}\n`
                : canonical.replace("{", '{"contractVersion":"taskmap-task-ranking.hostile",');
            (0, node_fs_1.writeFileSync)(rankingPath, hostileBytes, { mode: 0o600 });
            const candidate = rankedPublicationCandidate(successorProjection(baseline.projection));
            await (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, node_path_1.default.join(locations.runtimeRoot, `candidate-${variant}.json`), {
                graphInputDigest: digest(`candidate-${variant}-graph`),
                candidateDigest: digest(candidate),
                candidate: candidate,
                requestedAtMs: 2_236,
                expectedOwnerScopeDigest: TEST_OWNER_SCOPE.ownerScopeDigest,
            });
            assert.deepEqual(committedGeneration(locations.projectionPath).projection, candidate.projection);
        }
    });
    (0, node_test_1.it)("rejects a ranking-bearing candidate whose owner differs from the publisher authority", async () => {
        const locations = roots("taskmap-native-ranking-candidate-owner-");
        const ownerA = (0, confirmed_owner_js_1.confirmedTestOwner)("ranking-candidate-owner-a")
            .ownerScopeDigest;
        const ownerB = (0, confirmed_owner_js_1.confirmedTestOwner)("ranking-candidate-owner-b")
            .ownerScopeDigest;
        const candidate = rankedPublicationCandidate(undefined, ownerA);
        await assert.rejects(() => (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, node_path_1.default.join(locations.runtimeRoot, "wrong-owner-candidate.json"), ownerBoundPublicationInput(candidate, ownerB, "wrong-owner-candidate")), /loader_incompatible/);
        assert.equal((0, node_fs_1.existsSync)(locations.projectionPath), false);
    });
    (0, node_test_1.it)("rejects a referenced predecessor owned by another confirmed installation", async () => {
        const locations = roots("taskmap-native-ranking-predecessor-owner-");
        const ownerA = (0, confirmed_owner_js_1.confirmedTestOwner)("ranking-predecessor-owner-a")
            .ownerScopeDigest;
        const ownerB = (0, confirmed_owner_js_1.confirmedTestOwner)("ranking-predecessor-owner-b")
            .ownerScopeDigest;
        const baseline = rankedPublicationCandidate(undefined, ownerA);
        await (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, node_path_1.default.join(locations.runtimeRoot, "owner-a-baseline.json"), ownerBoundPublicationInput(baseline, ownerA, "owner-a-baseline"));
        const candidate = rankedPublicationCandidate(successorProjection(baseline.projection), ownerB);
        await assert.rejects(() => (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, node_path_1.default.join(locations.runtimeRoot, "owner-b-candidate.json"), ownerBoundPublicationInput(candidate, ownerB, "owner-b-candidate")), /publication_failed/);
    });
    (0, node_test_1.it)("does not recover an owner-A ranking journal under owner-B authority", async () => {
        const locations = roots("taskmap-native-ranking-recovery-owner-");
        const ownerA = (0, confirmed_owner_js_1.confirmedTestOwner)("ranking-recovery-owner-a");
        const ownerB = (0, confirmed_owner_js_1.confirmedTestOwner)("ranking-recovery-owner-b");
        const candidate = rankedPublicationCandidate(undefined, ownerA.ownerScopeDigest);
        const journalPath = node_path_1.default.join(locations.runtimeRoot, "taskmap-publication-journal.v1.json");
        (0, node_fs_1.mkdirSync)(locations.runtimeRoot, { recursive: true, mode: 0o700 });
        (0, node_fs_1.writeFileSync)(journalPath, `${JSON.stringify({
            contractVersion: "taskmap-native-publication-journal.v3",
            graphInputDigest: digest("owner-a-recovery:graph"),
            candidateDigest: digest(candidate),
            requestedAtMs: 2_241,
            candidateProjectionDigest: (0, source_contracts_js_1.diffTaskMapProjections)(null, candidate.projection)
                .currentProjectionDigest,
            candidate,
            previousCurrentness: null,
            candidateCurrentWork: null,
            previousCurrentWork: null,
            candidateRanking: candidate.ranking,
            previousRanking: null,
        }, null, 2)}\n`, { mode: 0o600 });
        const unavailableCollectors = Object.fromEntries(owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES.map((source) => [
            source,
            async () => { throw new Error(`${source} unavailable`); },
        ]));
        const serviceB = new TaskMapNativeRefreshService({
            ...locations,
            confirmedOwner: ownerB,
            collectors: unavailableCollectors,
            nowMs: () => 2_241,
        });
        const result = await serviceB.requestRefresh("timer");
        assert.equal(result.refreshStatus, "unavailable");
        assert.equal(result.publicationVerified, false);
        assert.equal(result.publicationBlockReason, "publication_failed");
        assert.equal((0, node_fs_1.existsSync)(journalPath), true);
        assert.equal((0, node_fs_1.existsSync)(locations.projectionPath), false);
        const state = artifact(locations.runtimeRoot, "taskmap-refresh-state.v1.json");
        assert.equal(state.ownerScopeDigest, ownerB.ownerScopeDigest);
        assert.equal(state.verifiedRankingDigest, null);
    });
    (0, node_test_1.it)("does not verify an owner-A ranking during owner-B due-state replay", async () => {
        const locations = roots("taskmap-native-ranking-due-owner-");
        const ownerA = (0, confirmed_owner_js_1.confirmedTestOwner)("ranking-due-owner-a");
        const ownerB = (0, confirmed_owner_js_1.confirmedTestOwner)("ranking-due-owner-b");
        const candidateA = rankedPublicationCandidate(undefined, ownerA.ownerScopeDigest);
        let now = 2_242;
        const serviceA = new TaskMapNativeRefreshService({
            ...locations,
            confirmedOwner: ownerA,
            collectors: collectors(),
            graphBuilder: graphBuilder(candidateA),
            nowMs: () => now,
        });
        assert.equal((await serviceA.requestRefresh("manual")).refreshStatus, "published");
        const statePath = node_path_1.default.join(locations.runtimeRoot, "taskmap-refresh-state.v1.json");
        const ownerBState = JSON.parse((0, node_fs_1.readFileSync)(statePath, "utf8"));
        ownerBState.ownerScopeDigest = ownerB.ownerScopeDigest;
        (0, node_fs_1.writeFileSync)(statePath, `${JSON.stringify(ownerBState, null, 2)}\n`, { mode: 0o600 });
        now += 1;
        const serviceB = new TaskMapNativeRefreshService({
            ...locations,
            confirmedOwner: ownerB,
            collectors: collectors(),
            graphBuilder: graphBuilder(rankedPublicationCandidate(undefined, ownerB.ownerScopeDigest)),
            nowMs: () => now,
        });
        const due = await serviceB.requestRefresh("timer");
        assert.equal(due.refreshStatus, "unavailable");
        assert.equal(due.publicationVerified, false);
    });
    (0, node_test_1.it)("reconciles a committed pair into durable state after a crash-before-state boundary", async () => {
        const locations = roots("taskmap-native-publication-recovery-");
        const candidate = publicationCandidate();
        const candidateDigest = digest(candidate);
        const graphInputDigest = "1".repeat(64);
        const committedAtMs = 2_250;
        const journalPath = node_path_1.default.join(locations.runtimeRoot, "taskmap-publication-journal.v1.json");
        await (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, journalPath, {
            graphInputDigest,
            candidateDigest,
            candidate: candidate,
            requestedAtMs: committedAtMs,
            promotionReceiptHeadDigest: (0, native_candidate_acceptance_js_1.taskMapNativeCandidateAcceptanceHeadDigest)(null),
            expectedOwnerScopeDigest: TEST_OWNER_SCOPE.ownerScopeDigest,
        });
        assert.equal((0, node_fs_1.existsSync)(journalPath), true);
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(locations.runtimeRoot, "taskmap-refresh-candidate.v1.json")), false);
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(locations.runtimeRoot, "taskmap-refresh-state.v1.json")), false);
        const calls = new Map();
        const service = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(calls),
            graphBuilder: graphBuilder(candidate),
            nowMs: () => committedAtMs + 10 * 60 * 1_000,
        });
        const result = await service.requestRefresh("timer");
        assert.equal(result.refreshStatus, "no_op");
        assert.equal(result.publicationVerified, true);
        assert.equal([...calls.values()].reduce((a, b) => a + b, 0), 0);
        assert.equal((0, node_fs_1.existsSync)(journalPath), false);
        const recoveredCandidate = artifact(locations.runtimeRoot, "taskmap-refresh-candidate.v1.json");
        assert.equal(recoveredCandidate.contractVersion, native_refresh_service_js_1.TASKMAP_NATIVE_REFRESH_CANDIDATE_VERSION);
        assert.equal(recoveredCandidate.requestedAtMs, committedAtMs);
        assert.equal(recoveredCandidate.graphInputDigest, graphInputDigest);
        assert.equal(recoveredCandidate.candidateDigest, candidateDigest);
        assert.deepEqual(recoveredCandidate.candidate, candidate);
        const state = artifact(locations.runtimeRoot, "taskmap-refresh-state.v1.json");
        assert.equal(state.lastSuccessfulRefreshAtMs, committedAtMs);
        assert.equal(state.lastRefreshStatus, "published");
        assert.equal(state.verifiedGraphInputDigest, graphInputDigest);
        assert.equal(state.verifiedCandidateDigest, candidateDigest);
        assert.equal(state.verifiedProjectionDigest, (0, node_crypto_1.createHash)("sha256")
            .update((0, node_fs_1.readFileSync)(locations.projectionPath))
            .digest("hex"));
    });
    (0, node_test_1.it)("does not swallow a promotion appended after a crash-before-state journal", async () => {
        const locations = roots("taskmap-native-publication-head-race-");
        const candidate = publicationCandidate();
        const committedAtMs = 2_500;
        await (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, node_path_1.default.join(locations.runtimeRoot, "taskmap-publication-journal.v1.json"), {
            graphInputDigest: "2".repeat(64),
            candidateDigest: digest(candidate),
            candidate: candidate,
            requestedAtMs: committedAtMs,
            promotionReceiptHeadDigest: "a".repeat(64),
            expectedOwnerScopeDigest: TEST_OWNER_SCOPE.ownerScopeDigest,
        });
        const calls = new Map();
        const service = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(calls),
            graphBuilder: graphBuilder(candidate),
            readCandidateAcceptanceHeadDigest: async () => "b".repeat(64),
            nowMs: () => committedAtMs + 10 * 60 * 1_000,
        });
        assert.equal(await service.recoverPendingPublication(), false, "a journal bound to the predecessor receipt head must not recover");
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(locations.runtimeRoot, "taskmap-publication-journal.v1.json")), false, "the stale journal must be durably discarded so a current rebuild can proceed");
        const result = await service.requestRefresh("timer");
        assert.notEqual(result.refreshStatus, "no_op");
        assert.ok([...calls.values()].reduce((sum, count) => sum + count, 0) > 0);
    });
    (0, node_test_1.it)("recovers a same-owner v4 journal only while the acceptance head is empty", async () => {
        for (const receiptState of ["empty", "nonempty"]) {
            const locations = roots(`taskmap-native-v4-${receiptState}-`);
            const candidate = rankedPublicationCandidate();
            const journalPath = node_path_1.default.join(locations.runtimeRoot, "taskmap-publication-journal.v1.json");
            await (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, journalPath, ownerBoundPublicationInput(candidate, TEST_OWNER_SCOPE.ownerScopeDigest, `legacy-v4-${receiptState}`));
            const journal = JSON.parse((0, node_fs_1.readFileSync)(journalPath, "utf8"));
            journal.contractVersion = "taskmap-native-publication-journal.v4";
            delete journal.promotionReceiptHeadDigest;
            (0, node_fs_1.writeFileSync)(journalPath, `${JSON.stringify(journal, null, 2)}\n`, { mode: 0o600 });
            const currentHead = receiptState === "empty"
                ? (0, native_candidate_acceptance_js_1.taskMapNativeCandidateAcceptanceHeadDigest)(null)
                : digest("legacy-v4-nonempty-head");
            const service = new TaskMapNativeRefreshService({
                ...locations,
                readCandidateAcceptanceHeadDigest: async () => currentHead,
                nowMs: () => 2_501,
            });
            assert.equal(await service.recoverPendingPublication(), receiptState === "empty");
            assert.equal((0, node_fs_1.existsSync)(journalPath), false);
            if (receiptState === "empty") {
                assert.equal(artifact(locations.runtimeRoot, "taskmap-refresh-state.v1.json").processedPromotionReceiptHeadDigest, currentHead);
                const sourceCalls = new Map();
                let graphBuilds = 0;
                const immediate = new TaskMapNativeRefreshService({
                    ...locations,
                    collectors: collectors(sourceCalls),
                    graphBuilder: async () => {
                        graphBuilds += 1;
                        return graphBuilder(candidate)();
                    },
                    readCandidateAcceptanceHeadDigest: async () => currentHead,
                    nowMs: () => 2_501,
                });
                const noOp = await immediate.requestRefresh("timer");
                assert.equal(noOp.refreshStatus, "no_op", JSON.stringify(noOp));
                assert.equal(sourceCalls.size, 0);
                assert.equal(graphBuilds, 0);
            }
        }
    });
    (0, node_test_1.it)("rolls a journaled generation forward after its publisher is killed between companions and projection", async () => {
        const locations = roots("taskmap-native-killed-publication-");
        const baseline = rankedPublicationCandidate();
        const baselineJournal = node_path_1.default.join(locations.runtimeRoot, "baseline-publication-journal.json");
        await (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, baselineJournal, ownerBoundPublicationInput(baseline, TEST_OWNER_SCOPE.ownerScopeDigest, "killed-baseline"));
        (0, node_fs_1.rmSync)(baselineJournal);
        const successor = rankedPublicationCandidate(successorProjection(baseline.projection));
        const journalPath = node_path_1.default.join(locations.runtimeRoot, "taskmap-publication-journal.v1.json");
        const markerPath = node_path_1.default.join(locations.runtimeRoot, "companions-durable.marker");
        await killPublicationChild(locations, journalPath, markerPath, "projection", ownerBoundPublicationInput(successor, TEST_OWNER_SCOPE.ownerScopeDigest, "killed-successor"));
        assert.deepEqual(JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8")), baseline.projection, "the kill boundary must precede the successor projection write");
        const restarted = new TaskMapNativeRefreshService({
            ...locations,
            nowMs: () => 2_255,
        });
        assert.equal(await restarted.recoverPendingPublication(), true);
        assert.deepEqual(JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8")), successor.projection);
        const recoveredCurrentness = JSON.parse((0, node_fs_1.readFileSync)(locations.currentnessPath, "utf8"));
        assert.deepEqual([...recoveredCurrentness.taskDispositions].sort((left, right) => left.taskId.localeCompare(right.taskId)), [...successor.currentness.taskDispositions].sort((left, right) => left.taskId.localeCompare(right.taskId)));
        assert.equal(recoveredCurrentness.projectionDigest, successor.currentness.projectionDigest);
        assert.deepEqual(JSON.parse((0, node_fs_1.readFileSync)((0, native_refresh_service_js_1.nativeTaskRankingPath)(locations.projectionPath), "utf8")), successor.ranking);
        assert.equal((0, node_fs_1.existsSync)(journalPath), false);
    });
    (0, node_test_1.it)("fails closed then recovers when a publisher is killed after each ranked companion mutation", async () => {
        for (const killStage of ["currentness", "ranking"]) {
            const locations = roots(`taskmap-native-killed-${killStage}-`);
            const baseline = rankedPublicationCandidate();
            const baselineJournal = node_path_1.default.join(locations.runtimeRoot, `baseline-${killStage}.json`);
            await (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, baselineJournal, ownerBoundPublicationInput(baseline, TEST_OWNER_SCOPE.ownerScopeDigest, `killed-${killStage}-baseline`));
            (0, node_fs_1.rmSync)(baselineJournal);
            const successor = rankedPublicationCandidate(successorProjection(baseline.projection));
            const journalPath = node_path_1.default.join(locations.runtimeRoot, "taskmap-publication-journal.v1.json");
            const markerPath = node_path_1.default.join(locations.runtimeRoot, `${killStage}.marker`);
            await killPublicationChild(locations, journalPath, markerPath, killStage, ownerBoundPublicationInput(successor, TEST_OWNER_SCOPE.ownerScopeDigest, `killed-${killStage}-successor`));
            const fixedProjection = JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8"));
            const tornCurrentness = JSON.parse((0, node_fs_1.readFileSync)(locations.currentnessPath, "utf8"));
            assert.deepEqual(fixedProjection, baseline.projection);
            assert.equal(tornCurrentness.projectionDigest, baseline.currentness.projectionDigest, "the visible predecessor must remain complete before the generation commit");
            assert.deepEqual(JSON.parse((0, node_fs_1.readFileSync)((0, native_refresh_service_js_1.nativeTaskRankingPath)(locations.projectionPath), "utf8")), baseline.ranking, "ranking must remain in the same visible predecessor generation");
            const restarted = new TaskMapNativeRefreshService({
                ...locations,
                nowMs: () => 2_256,
            });
            assert.equal(await restarted.recoverPendingPublication(), true);
            assert.deepEqual(JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8")), successor.projection);
            assert.deepEqual(JSON.parse((0, node_fs_1.readFileSync)((0, native_refresh_service_js_1.nativeTaskRankingPath)(locations.projectionPath), "utf8")), successor.ranking);
            assert.equal((0, node_fs_1.existsSync)(journalPath), false);
        }
    });
    (0, node_test_1.it)("keeps every concurrent reader on one complete predecessor until successor commit", async () => {
        const locations = roots("taskmap-native-concurrent-reader-");
        const baseline = rankedPublicationCandidate();
        const baselineJournal = node_path_1.default.join(locations.runtimeRoot, "baseline-concurrent-reader.json");
        await (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, baselineJournal, ownerBoundPublicationInput(baseline, TEST_OWNER_SCOPE.ownerScopeDigest, "concurrent-reader-baseline"));
        (0, node_fs_1.rmSync)(baselineJournal);
        const successor = rankedPublicationCandidate(successorProjection(baseline.projection));
        let releaseWrite;
        const blocked = new Promise((resolve) => {
            releaseWrite = resolve;
        });
        let markReached;
        const reached = new Promise((resolve) => {
            markReached = resolve;
        });
        const publication = (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, node_path_1.default.join(locations.runtimeRoot, "concurrent-reader-journal.json"), ownerBoundPublicationInput(successor, TEST_OWNER_SCOPE.ownerScopeDigest, "concurrent-reader-successor"), {
            writeCurrentness: async (directory, filename, value) => {
                (0, node_fs_1.writeFileSync)(node_path_1.default.join(directory, filename), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
                markReached();
                await blocked;
            },
        });
        await reached;
        try {
            for (let observation = 0; observation < 100; observation += 1) {
                const visible = committedGeneration(locations.projectionPath);
                assert.equal(visible.generationId, digest(baseline));
                assert.deepEqual(visible.projection, baseline.projection);
                assert.equal(visible.currentness.projectionDigest, baseline.currentness.projectionDigest);
                assert.equal(visible.ranking?.artifactDigest, baseline.ranking?.artifactDigest);
            }
        }
        finally {
            releaseWrite();
            await publication;
        }
        const visible = committedGeneration(locations.projectionPath);
        assert.equal(visible.generationId, digest(successor));
        assert.deepEqual(visible.projection, successor.projection);
        assert.equal(visible.ranking?.artifactDigest, successor.ranking?.artifactDigest);
    });
    (0, node_test_1.it)("keeps the production resolver available across atomic reference nlink 1-to-0 replacement", async () => {
        const locations = roots("taskmap-native-reference-unlink-reader-");
        const baseline = rankedExecutablePublicationCandidate(projectionWithTaskCount(2, loaderCompatibleProjection()));
        let now = 2_240;
        const publisher = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: graphBuilder(baseline),
            nowMs: () => now,
        });
        assert.equal((await publisher.requestRefresh("manual")).refreshStatus, "published");
        const referencePath = (0, native_refresh_service_js_1.nativeTaskMapGenerationReferencePath)(locations.projectionPath);
        const baselineReferenceBytes = (0, node_fs_1.readFileSync)(referencePath);
        const baselineGenerationId = digest(baseline);
        const successor = structuredClone(baseline);
        successor.currentness.taskDispositions[0] = {
            ...successor.currentness.taskDispositions[0],
            disposition: "needs_lifecycle_review",
        };
        writeReferencedPublicationPredecessor(locations.projectionPath, locations.currentnessPath, successor, "reference-unlink-successor");
        const successorReferenceBytes = (0, node_fs_1.readFileSync)(referencePath);
        const successorGenerationId = digest(successor);
        (0, node_fs_1.writeFileSync)(referencePath, baselineReferenceBytes, { mode: 0o600 });
        now += 1;
        const reader = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: graphBuilder(baseline),
            nowMs: () => now,
        });
        const probe = await (0, promises_1.open)(referencePath, "r");
        const fileHandlePrototype = Object.getPrototypeOf(probe);
        await probe.close();
        const originalReadFile = fileHandlePrototype.readFile;
        let armedGenerationId = null;
        let replacementPath = null;
        let replacementObserved = false;
        fileHandlePrototype.readFile = async function (...args) {
            const bytes = await originalReadFile.apply(this, args);
            if (armedGenerationId !== null && replacementPath !== null) {
                try {
                    const parsed = JSON.parse(bytes.toString());
                    if (parsed.contractVersion === native_refresh_service_js_1.TASKMAP_NATIVE_GENERATION_REFERENCE_VERSION
                        && parsed.generationId === armedGenerationId) {
                        (0, node_fs_1.renameSync)(replacementPath, referencePath);
                        replacementObserved = true;
                        armedGenerationId = null;
                        replacementPath = null;
                    }
                }
                catch {
                    // Non-reference owner artifacts continue through the real reader.
                }
            }
            return bytes;
        };
        try {
            for (let observation = 0; observation < 24; observation += 1) {
                const sourceIsBaseline = observation % 2 === 0;
                const sourceBytes = sourceIsBaseline
                    ? baselineReferenceBytes
                    : successorReferenceBytes;
                const targetBytes = sourceIsBaseline
                    ? successorReferenceBytes
                    : baselineReferenceBytes;
                const sourceGenerationId = sourceIsBaseline
                    ? baselineGenerationId
                    : successorGenerationId;
                const targetGenerationId = sourceIsBaseline
                    ? successorGenerationId
                    : baselineGenerationId;
                (0, node_fs_1.writeFileSync)(referencePath, sourceBytes, { mode: 0o600 });
                replacementPath = `${referencePath}.replacement-${observation}`;
                (0, node_fs_1.writeFileSync)(replacementPath, targetBytes, { mode: 0o600 });
                replacementObserved = false;
                armedGenerationId = sourceGenerationId;
                const result = await reader.requestRefresh("timer");
                assert.equal(result.refreshStatus, "no_op", "an opened complete predecessor or successor must not become unavailable");
                assert.equal(replacementObserved, true);
                const selected = committedGeneration(locations.projectionPath);
                assert.equal(selected.generationId, targetGenerationId);
                assert.ok(selected.generationId === baselineGenerationId
                    || selected.generationId === successorGenerationId);
                assert.deepEqual(selected.projection, baseline.projection);
                assert.equal(selected.ranking?.artifactDigest, baseline.ranking?.artifactDigest);
            }
        }
        finally {
            fileHandlePrototype.readFile = originalReadFile;
            if (replacementPath !== null)
                (0, node_fs_1.rmSync)(replacementPath, { force: true });
        }
    });
    (0, node_test_1.it)("never rewrites an older immutable generation when its candidate digest reappears", async () => {
        const locations = roots("taskmap-native-immutable-generation-");
        const baseline = rankedPublicationCandidate();
        await (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, node_path_1.default.join(locations.runtimeRoot, "immutable-baseline.json"), ownerBoundPublicationInput(baseline, TEST_OWNER_SCOPE.ownerScopeDigest, "immutable-baseline"));
        const baselineDirectory = node_path_1.default.join(node_path_1.default.dirname(locations.projectionPath), native_refresh_service_js_1.TASKMAP_NATIVE_GENERATIONS_DIRECTORY, digest(baseline));
        const baselineBytes = new Map((0, node_fs_1.readdirSync)(baselineDirectory).map((filename) => [
            filename,
            (0, node_fs_1.readFileSync)(node_path_1.default.join(baselineDirectory, filename)),
        ]));
        const successor = rankedPublicationCandidate(successorProjection(baseline.projection));
        await (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, node_path_1.default.join(locations.runtimeRoot, "immutable-successor.json"), ownerBoundPublicationInput(successor, TEST_OWNER_SCOPE.ownerScopeDigest, "immutable-successor"));
        await assert.rejects(() => (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, node_path_1.default.join(locations.runtimeRoot, "immutable-reappearance.json"), ownerBoundPublicationInput(baseline, TEST_OWNER_SCOPE.ownerScopeDigest, "immutable-reappearance")), /publication_failed/);
        const visible = committedGeneration(locations.projectionPath);
        assert.equal(visible.generationId, digest(successor));
        assert.deepEqual(visible.projection, successor.projection);
        for (const [filename, bytes] of baselineBytes) {
            assert.deepEqual((0, node_fs_1.readFileSync)(node_path_1.default.join(baselineDirectory, filename)), bytes, `${filename} in the prior generation must remain immutable`);
        }
    });
    (0, node_test_1.it)("keeps a complete predecessor or successor when killed at the generation commit boundary", async () => {
        for (const killStage of ["manifest", "reference"]) {
            const locations = roots(`taskmap-native-killed-${killStage}-`);
            const baseline = rankedCurrentWorkPublicationCandidate();
            writeReferencedPublicationPredecessor(locations.projectionPath, locations.currentnessPath, baseline, `${killStage}-baseline`);
            assert.notEqual(committedGeneration(locations.projectionPath).currentWork, null, "the referenced predecessor must include current-work before the kill");
            const successor = rankedCurrentWorkPublicationCandidate(successorProjection(baseline.projection));
            const publication = ownerBoundPublicationInput(successor, TEST_OWNER_SCOPE.ownerScopeDigest, `${killStage}-successor`);
            const journalPath = node_path_1.default.join(locations.runtimeRoot, "taskmap-publication-journal.v1.json");
            const markerPath = node_path_1.default.join(locations.runtimeRoot, `${killStage}.marker`);
            await killPublicationChild(locations, journalPath, markerPath, killStage, publication);
            const successorDirectory = node_path_1.default.join(node_path_1.default.dirname(locations.projectionPath), native_refresh_service_js_1.TASKMAP_NATIVE_GENERATIONS_DIRECTORY, publication.candidateDigest);
            assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(successorDirectory, "taskmap-generation-manifest.v1.json")), true, "the child must reach the real manifest/reference boundary");
            const visibleAfterKill = committedGeneration(locations.projectionPath);
            assert.equal(visibleAfterKill.generationId, killStage === "manifest"
                ? digest(baseline)
                : publication.candidateDigest);
            assert.deepEqual(visibleAfterKill.projection, killStage === "manifest"
                ? baseline.projection
                : successor.projection);
            assert.equal(visibleAfterKill.currentWork?.projection.projectionDigest, visibleAfterKill.currentness.projectionDigest, "the selected generation must include bound current-work");
            assert.equal(visibleAfterKill.ranking?.artifactDigest, killStage === "manifest"
                ? baseline.ranking?.artifactDigest
                : successor.ranking?.artifactDigest, "the selected generation must include bound ranking");
            const restarted = new TaskMapNativeRefreshService({
                ...locations,
                nowMs: () => 2_258,
            });
            assert.equal(await restarted.recoverPendingPublication(), true);
            const recovered = committedGeneration(locations.projectionPath);
            assert.equal(recovered.generationId, publication.candidateDigest);
            assert.deepEqual(recovered.projection, successor.projection);
            assert.equal(recovered.currentWork?.projection.projectionDigest, recovered.currentness.projectionDigest);
            assert.equal(recovered.ranking?.artifactDigest, successor.ranking?.artifactDigest);
            assert.equal((0, node_fs_1.existsSync)(journalPath), false);
        }
    });
    (0, node_test_1.it)("fails closed then recovers when a publisher is killed after current-work mutation", async () => {
        const locations = roots("taskmap-native-killed-current-work-");
        const baseline = rankedCurrentWorkPublicationCandidate();
        writeReferencedPublicationPredecessor(locations.projectionPath, locations.currentnessPath, baseline, "killed-current-work-baseline");
        assert.equal((0, node_fs_1.existsSync)((0, native_refresh_service_js_1.nativeTaskMapGenerationReferencePath)(locations.projectionPath)), true, "the current-work kill predecessor must be reference-bound");
        const successor = rankedCurrentWorkPublicationCandidate(successorProjection(baseline.projection));
        const journalPath = node_path_1.default.join(locations.runtimeRoot, "taskmap-publication-journal.v1.json");
        const markerPath = node_path_1.default.join(locations.runtimeRoot, "current-work.marker");
        await killPublicationChild(locations, journalPath, markerPath, "current-work", ownerBoundPublicationInput(successor, TEST_OWNER_SCOPE.ownerScopeDigest, "killed-current-work-successor"));
        const visibleAfterKill = committedGeneration(locations.projectionPath);
        assert.deepEqual(visibleAfterKill.projection, baseline.projection);
        assert.equal(visibleAfterKill.currentness.projectionDigest, baseline.currentness.projectionDigest, "current-work publication must not tear the visible predecessor");
        assert.deepEqual(visibleAfterKill.currentWork, currentWorkForProjection(baseline.projection));
        assert.equal(visibleAfterKill.ranking?.artifactDigest, baseline.ranking?.artifactDigest);
        const restarted = new TaskMapNativeRefreshService({
            ...locations,
            nowMs: () => 2_257,
        });
        assert.equal(await restarted.recoverPendingPublication(), true);
        const recovered = committedGeneration(locations.projectionPath);
        assert.deepEqual(recovered.projection, successor.projection);
        assert.notEqual(recovered.currentWork, null);
        assert.equal(recovered.ranking?.artifactDigest, successor.ranking?.artifactDigest);
        assert.equal((0, node_fs_1.existsSync)(journalPath), false);
    });
    (0, node_test_1.it)("rejects dependency drift when the current task is also semantically reparented", async () => {
        const locations = roots("taskmap-native-reparent-dependency-drift-");
        const baseline = rankedCurrentWorkPublicationCandidate();
        writeReferencedPublicationPredecessor(locations.projectionPath, locations.currentnessPath, baseline, "reparent-dependency-baseline");
        const projection = successorProjection(baseline.projection);
        const currentTaskId = baseline.ranking?.rankedAcceptedOpen[0]?.taskId;
        assert.ok(currentTaskId);
        const currentTask = projection.tasks.find((task) => task.id === currentTaskId);
        assert.ok(currentTask);
        const oldRoot = projection.roots.find((root) => root.id === currentTask.rootId);
        assert.ok(oldRoot);
        const newRoot = structuredClone(oldRoot);
        newRoot.id = "tmr_a111111111111111";
        newRoot.title = "Verified semantic reparent target";
        newRoot.taskIds = [currentTask.id];
        oldRoot.taskIds = oldRoot.taskIds.filter((id) => id !== currentTask.id);
        currentTask.rootId = newRoot.id;
        projection.roots.push(newRoot);
        for (const edge of projection.edges) {
            if (edge.relation === "advances"
                && edge.from === oldRoot.id
                && edge.to === currentTask.id)
                edge.from = newRoot.id;
        }
        const dependency = projection.tasks.find((task) => task.id !== currentTask.id && task.reviewState === "accepted");
        assert.ok(dependency);
        projection.edges.push({
            id: "tme_a111111111111111",
            from: currentTask.id,
            to: dependency.id,
            relation: "depends_on",
            citations: structuredClone(currentTask.citations),
        });
        const candidate = rankedCurrentWorkPublicationCandidate(projection);
        await assert.rejects((0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, node_path_1.default.join(locations.runtimeRoot, "reparent-dependency-drift-journal.v1.json"), ownerBoundPublicationInput(candidate, TEST_OWNER_SCOPE.ownerScopeDigest, "reparent-dependency-drift")), /predecessor_continuity_required/);
    });
    (0, node_test_1.it)("serializes concurrent exported publishers against one fixed pair", async () => {
        const locations = roots("taskmap-native-publisher-lock-");
        const baseline = publicationCandidate();
        const first = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: graphBuilder(baseline),
            nowMs: () => 2_300,
        });
        assert.equal((await first.requestRefresh("manual")).refreshStatus, "published");
        const projectionA = projectionWithDistinctAddedTask(baseline.projection, "tmt_a000000000000000");
        const projectionB = projectionWithDistinctAddedTask(baseline.projection, "tmt_b000000000000000");
        const candidateA = publicationCandidate(0, projectionA);
        const candidateB = publicationCandidate(0, projectionB);
        const inputs = [candidateA, candidateB].map((candidate, index) => ({
            graphInputDigest: String(index + 2).repeat(64),
            candidateDigest: digest(candidate),
            candidate: candidate,
            requestedAtMs: 2_301 + index,
            expectedOwnerScopeDigest: TEST_OWNER_SCOPE.ownerScopeDigest,
        }));
        const outcomes = await Promise.allSettled([
            (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, node_path_1.default.join(locations.runtimeRoot, "publisher-a-journal.v1.json"), inputs[0]),
            (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, node_path_1.default.join(locations.runtimeRoot, "publisher-b-journal.v1.json"), inputs[1]),
        ]);
        assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
        const rejected = outcomes.find((outcome) => outcome.status === "rejected");
        assert.ok(rejected);
        assert.match(String(rejected.reason.message), /predecessor_continuity_required/);
        const winnerIndex = outcomes.findIndex((outcome) => outcome.status === "fulfilled");
        const expected = winnerIndex === 0 ? candidateA : candidateB;
        const fixedProjection = JSON.parse((0, node_fs_1.readFileSync)(locations.projectionPath, "utf8"));
        const fixedCurrentness = JSON.parse((0, node_fs_1.readFileSync)(locations.currentnessPath, "utf8"));
        assert.deepEqual(fixedProjection.tasks.map((task) => task.id).sort(), expected.projection.tasks.map((task) => task.id).sort());
        assert.deepEqual(fixedCurrentness.taskDispositions.map((item) => item.taskId).sort(), expected.projection.tasks.map((task) => task.id).sort());
        assert.equal(fixedCurrentness.projectionDigest, (0, source_contracts_js_1.diffTaskMapProjections)(null, fixedProjection).currentProjectionDigest);
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(node_path_1.default.dirname(locations.projectionPath), ".taskmap-native-publication.lock")), false);
    });
    (0, node_test_1.it)("rejects an oversized fixed projection before journal or pair mutation", async () => {
        const locations = roots("taskmap-native-publication-size-");
        const baseline = publicationCandidate();
        const service = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: graphBuilder(baseline),
            nowMs: () => 2_350,
        });
        assert.equal((await service.requestRefresh("manual")).refreshStatus, "published");
        const candidatePath = node_path_1.default.join(locations.runtimeRoot, "taskmap-refresh-candidate.v1.json");
        const projectionBefore = (0, node_fs_1.readFileSync)(locations.projectionPath);
        const currentnessBefore = (0, node_fs_1.readFileSync)(locations.currentnessPath);
        const candidateBefore = (0, node_fs_1.readFileSync)(candidatePath);
        const oversizedProjection = structuredClone(baseline.projection);
        const firstSource = oversizedProjection.sources[0];
        assert.ok(firstSource);
        firstSource.sourceVersion = "x".repeat(3 * 1_024 * 1_024);
        assert.ok(Buffer.byteLength(`${JSON.stringify(oversizedProjection, null, 2)}\n`, "utf8") > 2 * 1_024 * 1_024);
        const oversizedCandidate = publicationCandidate(0, oversizedProjection);
        const oversizedJournalPath = node_path_1.default.join(locations.runtimeRoot, "oversized-publication-journal.v1.json");
        await assert.rejects((0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, oversizedJournalPath, {
            graphInputDigest: "9".repeat(64),
            candidateDigest: digest(oversizedCandidate),
            candidate: oversizedCandidate,
            requestedAtMs: 2_351,
        }), /loader_incompatible/);
        assert.deepEqual((0, node_fs_1.readFileSync)(locations.projectionPath), projectionBefore);
        assert.deepEqual((0, node_fs_1.readFileSync)(locations.currentnessPath), currentnessBefore);
        assert.deepEqual((0, node_fs_1.readFileSync)(candidatePath), candidateBefore);
        assert.equal((0, node_fs_1.existsSync)(oversizedJournalPath), false);
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(node_path_1.default.dirname(locations.projectionPath), ".taskmap-native-publication.lock")), false);
    });
    (0, node_test_1.it)("publishes 9 current plus 18 review-only rows only with an exhaustive bound companion", async () => {
        const locations = roots("taskmap-native-currentness-");
        (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(locations.projectionPath), { mode: 0o700 });
        const projection = projectionWithTaskCount(27);
        const prior = `${JSON.stringify(projection)}\n`;
        (0, node_fs_1.writeFileSync)(locations.projectionPath, prior, { mode: 0o600 });
        const predecessor = publicationCandidate(0, projection);
        (0, node_fs_1.writeFileSync)(locations.currentnessPath, `${JSON.stringify(predecessor.currentness)}\n`, { mode: 0o600 });
        const candidate = publicationCandidate(18, projection);
        const service = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: graphBuilder(candidate),
            nowMs: () => 2_500,
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published");
        assert.equal(result.publicationVerified, true);
        assert.equal(result.publicationBlockReason, null);
        const companion = JSON.parse((0, node_fs_1.readFileSync)(locations.currentnessPath, "utf8"));
        assert.equal(companion.contractVersion, native_refresh_service_js_1.TASKMAP_NATIVE_CURRENTNESS_GATE_VERSION);
        assert.equal(companion.runId, candidate.projection.runId);
        assert.equal(companion.inputDigest, candidate.projection.inputDigest);
        assert.equal(companion.projectionDigest, (0, source_contracts_js_1.diffTaskMapProjections)(null, candidate.projection).currentProjectionDigest);
        assert.equal(companion.taskDispositions.filter((item) => item.disposition === "current").length, 9);
        assert.equal(companion.taskDispositions.filter((item) => item.disposition === "needs_lifecycle_review").length, 18);
        assert.equal(new Set(companion.taskDispositions.map((item) => item.taskId)).size, 27);
        assert.equal((0, node_fs_1.statSync)(locations.currentnessPath).mode & 0o777, 0o600);
    });
    (0, node_test_1.it)("retains the exact last-good pair when currentness is partial or mismatched", async () => {
        const locations = roots("taskmap-native-currentness-mismatch-");
        const first = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: graphBuilder(),
            nowMs: () => 2_600,
        });
        assert.equal((await first.requestRefresh("manual")).refreshStatus, "published");
        const priorProjection = (0, node_fs_1.readFileSync)(locations.projectionPath);
        const priorCurrentness = (0, node_fs_1.readFileSync)(locations.currentnessPath);
        const partial = publicationCandidate();
        partial.currentness.taskDispositions.pop();
        const second = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(undefined, {
                agent_session: async () => slice("agent_session", "agent-session-r2"),
            }),
            graphBuilder: graphBuilder(partial),
            nowMs: () => 2_700,
        });
        const result = await second.requestRefresh("manual");
        assert.equal(result.refreshStatus, "unavailable");
        assert.equal(result.publicationVerified, false);
        assert.equal(result.publicationBlockReason, "currentness_companion_required");
        assert.deepEqual((0, node_fs_1.readFileSync)(locations.projectionPath), priorProjection);
        assert.deepEqual((0, node_fs_1.readFileSync)(locations.currentnessPath), priorCurrentness);
    });
    (0, node_test_1.it)("rejects a 27-to-9 task disappearance before the fixed projection commit", async () => {
        const locations = roots("taskmap-native-predecessor-");
        const predecessorProjection = projectionWithTaskCount(27);
        const predecessor = publicationCandidate(18, predecessorProjection);
        const first = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: graphBuilder(predecessor),
            nowMs: () => 2_800,
        });
        assert.equal((await first.requestRefresh("manual")).refreshStatus, "published");
        const priorProjection = (0, node_fs_1.readFileSync)(locations.projectionPath);
        const priorCurrentness = (0, node_fs_1.readFileSync)(locations.currentnessPath);
        const currentOnlyProjection = projectionWithTaskCount(9, predecessorProjection);
        const currentOnly = publicationCandidate(0, currentOnlyProjection);
        const second = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(undefined, {
                agent_session: async () => slice("agent_session", "agent-session-r2"),
            }),
            graphBuilder: graphBuilder(currentOnly),
            nowMs: () => 2_900,
        });
        const result = await second.requestRefresh("manual");
        assert.equal(result.refreshStatus, "unavailable");
        assert.equal(result.publicationVerified, false);
        assert.equal(result.publicationBlockReason, "predecessor_continuity_required");
        assert.deepEqual((0, node_fs_1.readFileSync)(locations.projectionPath), priorProjection);
        assert.deepEqual((0, node_fs_1.readFileSync)(locations.currentnessPath), priorCurrentness);
        assert.equal(artifact(locations.runtimeRoot, "taskmap-refresh-status.v1.json").publicationBlockReason, "predecessor_continuity_required");
    });
    (0, node_test_1.it)("fails predecessor continuity before persisting any candidate artifact", async () => {
        const locations = roots("taskmap-native-preflight-");
        const predecessorProjection = projectionWithTaskCount(27);
        const predecessor = publicationCandidate(18, predecessorProjection);
        writeReferencedPublicationPredecessor(locations.projectionPath, locations.currentnessPath, predecessor, "preflight-predecessor");
        const projectionBefore = (0, node_fs_1.readFileSync)(locations.projectionPath);
        const currentnessBefore = (0, node_fs_1.readFileSync)(locations.currentnessPath);
        const currentOnly = publicationCandidate(0, projectionWithTaskCount(9, predecessorProjection));
        const service = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: graphBuilder(currentOnly),
            nowMs: () => 2_950,
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "unavailable");
        assert.equal(result.publicationBlockReason, "predecessor_continuity_required");
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(locations.runtimeRoot, "taskmap-refresh-candidate.v1.json")), false);
        assert.deepEqual((0, node_fs_1.readFileSync)(locations.projectionPath), projectionBefore);
        assert.deepEqual((0, node_fs_1.readFileSync)(locations.currentnessPath), currentnessBefore);
    });
    (0, node_test_1.it)("fails closed when either referenced predecessor companion changes before staging or publication", async () => {
        for (const phase of ["before_preflight", "inside_publisher"]) {
            for (const mutation of ["delete", "corrupt"]) {
                const locations = roots(`taskmap-native-pair-${phase}-${mutation}-`);
                const predecessor = publicationCandidate();
                writeReferencedPublicationPredecessor(locations.projectionPath, locations.currentnessPath, predecessor, `pair-${phase}-${mutation}-predecessor`);
                const projectionBefore = (0, node_fs_1.readFileSync)(locations.projectionPath);
                const referencedCurrentnessPath = node_path_1.default.join(node_path_1.default.dirname(locations.projectionPath), native_refresh_service_js_1.TASKMAP_NATIVE_GENERATIONS_DIRECTORY, digest(predecessor), node_path_1.default.basename(locations.currentnessPath));
                const mutateCurrentness = () => {
                    if (mutation === "delete") {
                        (0, node_fs_1.rmSync)(referencedCurrentnessPath);
                    }
                    else {
                        (0, node_fs_1.writeFileSync)(referencedCurrentnessPath, "{}\n", { mode: 0o600 });
                    }
                };
                let publisherCalls = 0;
                const service = new TaskMapNativeRefreshService({
                    ...locations,
                    collectors: collectors(),
                    graphBuilder: async () => {
                        if (phase === "before_preflight")
                            mutateCurrentness();
                        return graphBuilder(predecessor)();
                    },
                    publisher: async (input) => {
                        publisherCalls += 1;
                        if (phase === "inside_publisher")
                            mutateCurrentness();
                        return (0, native_refresh_service_js_1.publishTaskMapNativeProjection)(locations.projectionPath, locations.currentnessPath, node_path_1.default.join(locations.runtimeRoot, "taskmap-publication-journal.v1.json"), input);
                    },
                    nowMs: () => 2_975,
                });
                const result = await service.requestRefresh("manual");
                assert.equal(result.refreshStatus, "unavailable");
                assert.equal(result.publicationBlockReason, "publication_failed");
                assert.equal(publisherCalls, phase === "inside_publisher" ? 1 : 0);
                assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(locations.runtimeRoot, "taskmap-refresh-candidate.v1.json")), false);
                assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(locations.runtimeRoot, "taskmap-publication-journal.v1.json")), false);
                assert.deepEqual((0, node_fs_1.readFileSync)(locations.projectionPath), projectionBefore);
            }
        }
    });
    (0, node_test_1.it)("keeps restart no-op deterministic but rebuilds when source disposition changes", async () => {
        const locations = roots("taskmap-native-last-good-");
        const first = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: graphBuilder(),
            nowMs: () => 3_000,
        });
        assert.equal((await first.requestRefresh("timer")).refreshStatus, "published");
        let graphBuilds = 0;
        const second = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: async () => {
                graphBuilds += 1;
                return graphBuilder()();
            },
            nowMs: () => 3_000 + owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS,
        });
        const unchanged = await second.requestRefresh("timer");
        assert.equal(unchanged.refreshStatus, "no_op");
        assert.equal(graphBuilds, 0);
        const third = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(undefined, {
                meeting_notes: async () => {
                    throw new Error("meeting connector temporarily unavailable");
                },
            }),
            graphBuilder: async () => {
                graphBuilds += 1;
                return graphBuilder()();
            },
            nowMs: () => 3_000 + 2 * owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS,
        });
        const result = await third.requestRefresh("timer");
        assert.equal(result.refreshStatus, "published");
        assert.equal(graphBuilds, 1);
        assert.equal(result.sourceStatuses.find((item) => item.source === "meeting_notes")?.disposition, "retained_last_good");
    });
    (0, node_test_1.it)("reverifies the referenced generation after a compatibility-mirror race", async () => {
        const locations = roots("taskmap-native-no-op-currentness-race-");
        const firstAtMs = 3_500;
        const first = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: graphBuilder(),
            nowMs: () => firstAtMs,
        });
        assert.equal((await first.requestRefresh("manual")).refreshStatus, "published");
        const baselineState = artifact(locations.runtimeRoot, "taskmap-refresh-state.v1.json");
        const projectionBefore = (0, node_fs_1.readFileSync)(locations.projectionPath);
        const candidatePath = node_path_1.default.join(locations.runtimeRoot, "taskmap-refresh-candidate.v1.json");
        const candidateBefore = (0, node_fs_1.readFileSync)(candidatePath);
        let graphBuilds = 0;
        const replayAtMs = firstAtMs + 100;
        const replay = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(undefined, {
                agent_session: async () => {
                    (0, node_fs_1.writeFileSync)(locations.currentnessPath, "{}\n", { mode: 0o600 });
                    return slice("agent_session");
                },
            }),
            graphBuilder: async () => {
                graphBuilds += 1;
                return graphBuilder()();
            },
            nowMs: () => replayAtMs,
        });
        const result = await replay.requestRefresh("manual");
        assert.equal(result.refreshStatus, "no_op");
        assert.equal(result.publicationVerified, true);
        assert.equal(result.publicationBlockReason, null);
        assert.equal(graphBuilds, 0);
        assert.deepEqual((0, node_fs_1.readFileSync)(locations.projectionPath), projectionBefore);
        assert.deepEqual((0, node_fs_1.readFileSync)(candidatePath), candidateBefore);
        assert.equal((0, node_fs_1.readFileSync)(locations.currentnessPath, "utf8"), "{}\n");
        const verifiedState = artifact(locations.runtimeRoot, "taskmap-refresh-state.v1.json");
        assert.equal(verifiedState.lastAttemptAtMs, replayAtMs);
        assert.equal(verifiedState.lastSuccessfulRefreshAtMs, replayAtMs);
        assert.equal(verifiedState.lastRefreshStatus, "no_op");
        assert.equal(verifiedState.lastPublicationBlockReason, null);
        assert.deepEqual(verifiedState.sources, baselineState.sources);
        for (const digestName of [
            "verifiedGraphInputDigest",
            "verifiedCandidateDigest",
            "verifiedProjectionDigest",
        ]) {
            assert.equal(verifiedState[digestName], baselineState[digestName]);
        }
    });
    (0, node_test_1.it)("persists the four-hour due gate while manual refresh bypasses it", async () => {
        const locations = roots("taskmap-native-due-");
        const calls = new Map();
        let now = 5_000;
        const service = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(calls),
            graphBuilder: graphBuilder(),
            nowMs: () => now,
        });
        assert.equal((await service.requestRefresh("timer")).refreshStatus, "published");
        assert.equal([...calls.values()].reduce((a, b) => a + b, 0), 4);
        now += 10 * 60 * 1_000;
        assert.equal((await service.requestRefresh("timer")).refreshStatus, "no_op");
        assert.equal((await service.requestRefresh("launch")).refreshStatus, "no_op");
        assert.equal([...calls.values()].reduce((a, b) => a + b, 0), 4);
        assert.equal((await service.requestRefresh("manual")).refreshStatus, "no_op");
        assert.equal([...calls.values()].reduce((a, b) => a + b, 0), 8);
    });
    (0, node_test_1.it)("invalidates the four-hour shortcut when the authenticated promotion receipt head changes", async () => {
        const locations = roots("taskmap-native-promotion-head-due-");
        const calls = new Map();
        let now = 5_250;
        let head = digest("promotion-head-a");
        let graphBuilds = 0;
        const service = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(calls),
            graphBuilder: async (barrier) => {
                graphBuilds += 1;
                assert.equal(barrier.graphInput.promotionReceiptHeadDigest, head);
                return graphBuilder()();
            },
            readCandidateAcceptanceHeadDigest: async () => head,
            nowMs: () => now,
        });
        assert.equal((await service.requestRefresh("timer")).refreshStatus, "published");
        assert.equal(graphBuilds, 1);
        assert.equal(artifact(locations.runtimeRoot, "taskmap-refresh-state.v1.json").processedPromotionReceiptHeadDigest, head);
        now += 10 * 60 * 1_000;
        assert.equal((await service.requestRefresh("timer")).refreshStatus, "no_op");
        assert.equal(graphBuilds, 1);
        assert.equal([...calls.values()].reduce((a, b) => a + b, 0), 4);
        head = digest("promotion-head-b");
        assert.equal((await service.requestRefresh("timer")).refreshStatus, "published");
        assert.equal(graphBuilds, 2);
        assert.equal([...calls.values()].reduce((a, b) => a + b, 0), 8);
        assert.equal(artifact(locations.runtimeRoot, "taskmap-refresh-state.v1.json").processedPromotionReceiptHeadDigest, head);
    });
    (0, node_test_1.it)("does not record a no-eligible-work no-op when the promotion receipt head changes", async () => {
        const locations = roots("taskmap-native-promotion-head-no-eligible-race-");
        const firstHead = digest("no-eligible-head-a");
        const changedHead = digest("no-eligible-head-b");
        let reads = 0;
        const service = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(new Map()),
            graphBuilder: async () => {
                throw new native_semantic_builder_adapter_js_1.TaskMapNativeSemanticBuilderUnavailableError("no_eligible_work");
            },
            readCandidateAcceptanceHeadDigest: async () => (reads++ < 2 ? firstHead : changedHead),
            nowMs: () => 5_375,
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "unavailable");
        const state = artifact(locations.runtimeRoot, "taskmap-refresh-state.v1.json");
        assert.notEqual(state.processedPromotionReceiptHeadDigest, firstHead);
    });
    (0, node_test_1.it)("reports a due no-op from the verified generation despite a torn compatibility mirror", async () => {
        const locations = roots("taskmap-native-due-pair-");
        const calls = new Map();
        let now = 5_500;
        const service = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(calls),
            graphBuilder: graphBuilder(),
            nowMs: () => now,
        });
        assert.equal((await service.requestRefresh("timer")).refreshStatus, "published");
        (0, node_fs_1.writeFileSync)(locations.currentnessPath, "{}\n", { mode: 0o600 });
        now += 10 * 60 * 1_000;
        const result = await service.requestRefresh("timer");
        assert.equal(result.refreshStatus, "no_op");
        assert.equal(result.publicationVerified, true);
        assert.equal(result.publicationBlockReason, null);
        assert.ok(result.nextDueAtMs > now);
        assert.equal([...calls.values()].reduce((a, b) => a + b, 0), 4);
        assert.equal(artifact(locations.runtimeRoot, "taskmap-refresh-state.v1.json").lastRefreshStatus, "published");
        now += 10 * 60 * 1_000;
        const retried = await service.requestRefresh("timer");
        assert.equal(retried.refreshStatus, "no_op");
        assert.ok(retried.nextDueAtMs > now);
        assert.equal([...calls.values()].reduce((a, b) => a + b, 0), 4);
    });
    (0, node_test_1.it)("fails closed when only fixed compatibility mirrors remain owner-bound", async () => {
        const locations = roots("taskmap-native-fixed-only-owner-bound-");
        const calls = new Map();
        let now = 5_750;
        const service = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(calls),
            graphBuilder: graphBuilder(),
            nowMs: () => now,
        });
        assert.equal((await service.requestRefresh("timer")).refreshStatus, "published");
        (0, node_fs_1.rmSync)((0, native_refresh_service_js_1.nativeTaskMapGenerationReferencePath)(locations.projectionPath));
        assert.equal((0, node_fs_1.existsSync)(locations.projectionPath), true);
        assert.equal((0, node_fs_1.existsSync)(locations.currentnessPath), true);
        now += 10 * 60 * 1_000;
        const result = await service.requestRefresh("timer");
        assert.equal(result.refreshStatus, "unavailable");
        assert.equal(result.publicationVerified, false);
        assert.equal(result.publicationBlockReason, "publication_failed");
        assert.equal([...calls.values()].reduce((a, b) => a + b, 0), 4);
    });
    (0, node_test_1.it)("keeps a failed first attempt immediately due and retries on the next timer", async () => {
        const locations = roots("taskmap-native-failed-first-due-");
        const calls = new Map();
        const failedAtMs = 6_000;
        const first = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(calls),
            nowMs: () => failedAtMs,
        });
        const failed = await first.requestRefresh("timer");
        assert.equal(failed.refreshStatus, "unavailable");
        assert.equal(failed.publicationBlockReason, "semantic_provider_unavailable");
        assert.equal(failed.nextDueAtMs, failedAtMs);
        assert.equal([...calls.values()].reduce((a, b) => a + b, 0), 4);
        const retriedAtMs = failedAtMs + 10 * 60 * 1_000;
        const second = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(calls),
            graphBuilder: graphBuilder(),
            nowMs: () => retriedAtMs,
        });
        const retried = await second.requestRefresh("timer");
        assert.equal(retried.refreshStatus, "published");
        assert.equal([...calls.values()].reduce((a, b) => a + b, 0), 8);
        assert.equal(retried.nextDueAtMs, retriedAtMs + owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS);
    });
    (0, node_test_1.it)("does not move an existing success boundary after a failed due attempt", async () => {
        const locations = roots("taskmap-native-prior-success-due-");
        const succeededAtMs = 6_500;
        const first = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: graphBuilder(),
            nowMs: () => succeededAtMs,
        });
        assert.equal((await first.requestRefresh("timer")).refreshStatus, "published");
        const dueAtMs = succeededAtMs + owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS;
        const changedCollectors = collectors(undefined, {
            agent_session: async () => slice("agent_session", "agent-session-r2"),
        });
        const failed = new TaskMapNativeRefreshService({
            ...locations,
            collectors: changedCollectors,
            nowMs: () => dueAtMs,
        });
        const failedResult = await failed.requestRefresh("timer");
        assert.equal(failedResult.refreshStatus, "unavailable");
        assert.equal(failedResult.nextDueAtMs, dueAtMs);
        assert.equal(artifact(locations.runtimeRoot, "taskmap-refresh-state.v1.json").lastSuccessfulRefreshAtMs, succeededAtMs);
        const retryAtMs = dueAtMs + 10 * 60 * 1_000;
        const retry = new TaskMapNativeRefreshService({
            ...locations,
            collectors: changedCollectors,
            graphBuilder: graphBuilder(),
            nowMs: () => retryAtMs,
        });
        const retryResult = await retry.requestRefresh("timer");
        assert.equal(retryResult.refreshStatus, "published");
        assert.equal(retryResult.nextDueAtMs, retryAtMs + owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS);
    });
    (0, node_test_1.it)("serializes two processes and re-evaluates timer due state after the owner exits", async () => {
        const locations = roots("taskmap-native-lock-");
        const calls = new Map();
        let release;
        const held = new Promise((resolve) => {
            release = resolve;
        });
        const candidate = publicationCandidate();
        const first = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(calls),
            graphBuilder: async () => {
                await held;
                return {
                    candidateDigest: digest(candidate),
                    candidate: candidate,
                };
            },
            nowMs: () => 7_000,
        });
        const second = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(calls),
            graphBuilder: graphBuilder(candidate),
            nowMs: () => 7_001,
        });
        const owner = first.requestRefresh("launch");
        await new Promise((resolve) => setTimeout(resolve, 25));
        const waiter = second.requestRefresh("timer");
        release();
        const [ownerResult, waiterResult] = await Promise.all([owner, waiter]);
        assert.equal(ownerResult.refreshStatus, "published");
        assert.equal(waiterResult.refreshStatus, "no_op");
        assert.equal(waiterResult.requestedAtMs, 7_001);
        assert.equal([...calls.values()].reduce((a, b) => a + b, 0), 4);
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(locations.runtimeRoot, "taskmap-refresh.lock")), false);
    });
    (0, node_test_1.it)("keeps lock-timeout receipts immediately due without racing the active owner", async () => {
        const locations = roots("taskmap-native-lock-timeout-");
        const succeededAtMs = 7_250;
        const first = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: graphBuilder(),
            nowMs: () => succeededAtMs,
        });
        assert.equal((await first.requestRefresh("manual")).refreshStatus, "published");
        const statePath = node_path_1.default.join(locations.runtimeRoot, "taskmap-refresh-state.v1.json");
        const statusPath = node_path_1.default.join(locations.runtimeRoot, "taskmap-refresh-status.v1.json");
        const stateBefore = (0, node_fs_1.readFileSync)(statePath);
        const statusBefore = (0, node_fs_1.readFileSync)(statusPath);
        const lockPath = node_path_1.default.join(locations.runtimeRoot, "taskmap-refresh.lock");
        const generation = "00000000-0000-4000-8000-000000000001";
        (0, node_fs_1.mkdirSync)(lockPath, { mode: 0o700 });
        (0, node_fs_1.writeFileSync)(node_path_1.default.join(lockPath, `owner.${generation}.json`), `${JSON.stringify({
            contractVersion: "taskmap-native-refresh-lock.v2",
            generation,
            pid: process.pid,
            createdAtMs: Date.now(),
            processStartMarker: null,
        })}\n`, { mode: 0o600 });
        const waitingAtMs = succeededAtMs + 100;
        const waiter = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: graphBuilder(),
            nowMs: () => waitingAtMs,
            lockWaitMs: 1,
        });
        const result = await waiter.requestRefresh("timer");
        assert.equal(result.refreshStatus, "unavailable");
        assert.equal(result.publicationVerified, false);
        assert.equal(result.publicationBlockReason, "publication_failed");
        assert.equal(result.requestedAtMs, waitingAtMs);
        assert.equal(result.nextDueAtMs, waitingAtMs);
        assert.deepEqual((0, node_fs_1.readFileSync)(statePath), stateBefore);
        assert.deepEqual((0, node_fs_1.readFileSync)(statusPath), statusBefore);
        (0, node_fs_1.rmSync)(lockPath, { recursive: true });
    });
    (0, node_test_1.it)("reclaims a live PID lock whose process-start marker no longer matches", async () => {
        const locations = roots("taskmap-native-pid-reuse-lock-");
        const lockPath = node_path_1.default.join(locations.runtimeRoot, "taskmap-refresh.lock");
        const generation = "00000000-0000-4000-8000-000000000002";
        (0, node_fs_1.mkdirSync)(lockPath, { recursive: true, mode: 0o700 });
        (0, node_fs_1.writeFileSync)(node_path_1.default.join(lockPath, `owner.${generation}.json`), `${JSON.stringify({
            contractVersion: "taskmap-native-refresh-lock.v2",
            generation,
            pid: process.pid,
            createdAtMs: Date.now(),
            processStartMarker: "definitely-not-the-current-process-start",
        })}\n`, { mode: 0o600 });
        const service = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: graphBuilder(),
            nowMs: () => 7_300,
            lockWaitMs: 250,
            readProcessStartMarker: async (pid) => pid === process.pid ? "current-process-start" : null,
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published");
        assert.equal(result.publicationVerified, true);
        assert.equal((0, node_fs_1.existsSync)(lockPath), false);
    });
    (0, node_test_1.it)("never removes a newer lock generation after deciding an older owner is stale", async () => {
        const locations = roots("taskmap-native-lock-aba-");
        const lockPath = node_path_1.default.join(locations.runtimeRoot, "taskmap-refresh.lock");
        const writeOwner = (generation, processStartMarker) => {
            (0, node_fs_1.mkdirSync)(lockPath, { recursive: true, mode: 0o700 });
            (0, node_fs_1.writeFileSync)(node_path_1.default.join(lockPath, `owner.${generation}.json`), `${JSON.stringify({
                contractVersion: "taskmap-native-refresh-lock.v2",
                generation,
                pid: process.pid,
                createdAtMs: Date.now(),
                processStartMarker,
            })}\n`, { mode: 0o600 });
        };
        const generationA = "00000000-0000-4000-8000-000000000003";
        const generationB = "00000000-0000-4000-8000-000000000004";
        writeOwner(generationA, "stale-generation-a");
        let permitStaleDecision;
        const staleDecisionMayContinue = new Promise((resolve) => {
            permitStaleDecision = resolve;
        });
        let staleReceiptChecked;
        const staleReceiptWasChecked = new Promise((resolve) => {
            staleReceiptChecked = resolve;
        });
        let markerReads = 0;
        const reclaimer = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: graphBuilder(),
            nowMs: () => 7_350,
            lockWaitMs: 75,
            readProcessStartMarker: async () => {
                markerReads += 1;
                if (markerReads === 1) {
                    staleReceiptChecked();
                    await staleDecisionMayContinue;
                }
                return "current-generation-b";
            },
        });
        const resultPromise = reclaimer.requestRefresh("manual");
        await staleReceiptWasChecked;
        (0, node_fs_1.rmSync)(lockPath, { recursive: true });
        writeOwner(generationB, "current-generation-b");
        permitStaleDecision();
        const result = await resultPromise;
        assert.equal(result.refreshStatus, "unavailable");
        assert.equal((0, node_fs_1.existsSync)(lockPath), true);
        const liveOwner = JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(lockPath, `owner.${generationB}.json`), "utf8"));
        assert.equal(liveOwner.processStartMarker, "current-generation-b");
        (0, node_fs_1.rmSync)(lockPath, { recursive: true });
    });
    (0, node_test_1.it)("does not let a contender replace the lock during generation cleanup", async () => {
        const locations = roots("taskmap-native-lock-cleanup-window-");
        let releaseCleanup;
        const cleanupMayContinue = new Promise((resolve) => {
            releaseCleanup = resolve;
        });
        let cleanupClaimed;
        const cleanupReceiptWasClaimed = new Promise((resolve) => {
            cleanupClaimed = resolve;
        });
        let contenderMissed;
        const contenderSawExistingLock = new Promise((resolve) => {
            contenderMissed = resolve;
        });
        const first = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: graphBuilder(),
            nowMs: () => 7_360,
            afterLockReceiptClaimForTesting: async () => {
                cleanupClaimed();
                await cleanupMayContinue;
            },
        });
        const second = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: graphBuilder(),
            nowMs: () => 7_361,
            lockWaitMs: 250,
            afterLockAcquisitionMissForTesting: contenderMissed,
        });
        const firstResultPromise = first.requestRefresh("manual");
        await cleanupReceiptWasClaimed;
        const secondResultPromise = second.requestRefresh("manual");
        await contenderSawExistingLock;
        releaseCleanup();
        const [firstResult, secondResult] = await Promise.all([
            firstResultPromise,
            secondResultPromise,
        ]);
        assert.equal(firstResult.refreshStatus, "published");
        assert.notEqual(secondResult.refreshStatus, "unavailable");
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(locations.runtimeRoot, "taskmap-refresh.lock")), false);
        assert.deepEqual((0, node_fs_1.readdirSync)(locations.runtimeRoot).filter((name) => name.includes("taskmap-refresh.lock")), []);
    });
    (0, node_test_1.it)("recovers an empty lock only from its provably stale staged owner", async () => {
        const locations = roots("taskmap-native-lock-empty-initializer-");
        const lockPath = node_path_1.default.join(locations.runtimeRoot, "taskmap-refresh.lock");
        const generation = "00000000-0000-4000-8000-000000000005";
        (0, node_fs_1.mkdirSync)(lockPath, { recursive: true, mode: 0o700 });
        (0, node_fs_1.writeFileSync)(`${lockPath}.candidate.${generation}.json`, `${JSON.stringify({
            contractVersion: "taskmap-native-refresh-lock.v2",
            generation,
            pid: process.pid,
            createdAtMs: Date.now(),
            processStartMarker: "crashed-initializer",
        })}\n`, { mode: 0o600 });
        const service = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: graphBuilder(),
            nowMs: () => 7_370,
            lockWaitMs: 250,
            readProcessStartMarker: async () => "current-process-generation",
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "published");
        assert.equal((0, node_fs_1.existsSync)(lockPath), false);
        assert.equal((0, node_fs_1.existsSync)(`${lockPath}.candidate.${generation}.json`), false);
    });
    (0, node_test_1.it)("does not remove a recreated initializer lock after a concurrent reclaimer wins", async () => {
        const locations = roots("taskmap-native-lock-empty-reclaimer-aba-");
        const lockPath = node_path_1.default.join(locations.runtimeRoot, "taskmap-refresh.lock");
        const generationA = "00000000-0000-4000-8000-000000000006";
        const generationB = "00000000-0000-4000-8000-000000000007";
        (0, node_fs_1.mkdirSync)(lockPath, { recursive: true, mode: 0o700 });
        (0, node_fs_1.writeFileSync)(`${lockPath}.candidate.${generationA}.json`, `${JSON.stringify({
            contractVersion: "taskmap-native-refresh-lock.v2",
            generation: generationA,
            pid: process.pid,
            createdAtMs: Date.now(),
            processStartMarker: "crashed-initializer-a",
        })}\n`, { mode: 0o600 });
        let firstClaimed;
        const firstHasClaimed = new Promise((resolve) => {
            firstClaimed = resolve;
        });
        let releaseFirst;
        const firstMayContinue = new Promise((resolve) => {
            releaseFirst = resolve;
        });
        let firstMarker = "reclaimer-one";
        const first = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: graphBuilder(),
            nowMs: () => 7_375,
            lockWaitMs: 125,
            readProcessStartMarker: async () => firstMarker,
            afterEmptyLockRecoveryReceiptClaimForTesting: async () => {
                firstClaimed();
                await firstMayContinue;
            },
        });
        const firstResultPromise = first.requestRefresh("manual");
        await firstHasClaimed;
        const second = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(),
            graphBuilder: graphBuilder(),
            nowMs: () => 7_376,
            lockWaitMs: 250,
            readProcessStartMarker: async () => "reclaimer-two",
        });
        const secondResult = await second.requestRefresh("manual");
        assert.equal(secondResult.refreshStatus, "published");
        (0, node_fs_1.mkdirSync)(lockPath, { mode: 0o700 });
        (0, node_fs_1.writeFileSync)(`${lockPath}.candidate.${generationB}.json`, `${JSON.stringify({
            contractVersion: "taskmap-native-refresh-lock.v2",
            generation: generationB,
            pid: process.pid,
            createdAtMs: Date.now(),
            processStartMarker: "initializer-b",
        })}\n`, { mode: 0o600 });
        firstMarker = "initializer-b";
        releaseFirst();
        const firstResult = await firstResultPromise;
        assert.equal(firstResult.refreshStatus, "unavailable");
        assert.equal((0, node_fs_1.existsSync)(lockPath), true);
        assert.equal((0, node_fs_1.existsSync)(`${lockPath}.candidate.${generationB}.json`), true);
        (0, node_fs_1.rmSync)(lockPath, { recursive: true });
        (0, node_fs_1.rmSync)(`${lockPath}.candidate.${generationB}.json`);
    });
    (0, node_test_1.it)("reacquires for an overlapping manual request instead of swallowing it as not due", async () => {
        const locations = roots("taskmap-native-manual-lock-");
        const calls = new Map();
        let release;
        const held = new Promise((resolve) => {
            release = resolve;
        });
        const candidate = publicationCandidate();
        const first = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(calls),
            graphBuilder: async () => {
                await held;
                return graphBuilder(candidate)();
            },
            nowMs: () => 7_500,
        });
        const second = new TaskMapNativeRefreshService({
            ...locations,
            collectors: collectors(calls),
            graphBuilder: graphBuilder(candidate),
            nowMs: () => 7_501,
        });
        const owner = first.requestRefresh("launch");
        await new Promise((resolve) => setTimeout(resolve, 25));
        const waiter = second.requestRefresh("manual");
        release();
        const [ownerResult, waiterResult] = await Promise.all([owner, waiter]);
        assert.equal(ownerResult.refreshStatus, "published");
        assert.equal(waiterResult.refreshStatus, "no_op");
        assert.equal(waiterResult.requestedAtMs, 7_501);
        assert.equal([...calls.values()].reduce((a, b) => a + b, 0), 8);
    });
});
(0, node_test_1.describe)("DEBUG-only POST /internal/taskmap/refresh scaffold", () => {
    const internalTestUser = "14802294-BEED-480E-ABF6-7E3703FA25CD";
    (0, node_test_1.it)("is absent by default", async () => {
        const server = (0, internal_server_js_1.createInternalServer)({ expectedUserId: internalTestUser });
        servers.push(server);
        await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
        const address = server.address();
        assert.ok(address && typeof address === "object");
        const response = await fetch(`http://127.0.0.1:${address.port}/internal/taskmap/refresh`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ trigger: "timer" }),
        });
        assert.equal(response.status, 404);
    });
    (0, node_test_1.it)("requires an explicit injected test dependency", async () => {
        const server = (0, internal_server_js_1.createInternalServer)({
            expectedUserId: internalTestUser,
            enableDebugTaskMapRefresh: true,
            taskMapRefresh: async () => ({
                status: "partial",
                refreshStatus: "unavailable",
                sourceStatuses: owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES.map((source) => ({
                    source,
                    disposition: "unavailable",
                    state: "unavailable",
                    lastSuccessAtMs: null,
                    nextDueAtMs: null,
                    proof: null,
                })),
                requestedAtMs: 6_000,
                nextDueAtMs: 6_000 + owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS,
                publicationVerified: false,
                publicationBlockReason: "semantic_provider_unavailable",
            }),
        });
        servers.push(server);
        await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
        const address = server.address();
        assert.ok(address && typeof address === "object");
        const response = await fetch(`http://127.0.0.1:${address.port}/internal/taskmap/refresh`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ trigger: "timer" }),
        });
        assert.equal(response.status, 200);
        const payload = await response.json();
        assert.equal(payload.refreshStatus, "unavailable");
        assert.equal(JSON.stringify(payload).includes("/Users/"), false);
        assert.equal(JSON.stringify(payload).includes("sourceBodies"), false);
    });
});
