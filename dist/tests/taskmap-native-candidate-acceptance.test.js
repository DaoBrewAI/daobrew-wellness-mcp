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
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const native_candidate_acceptance_js_1 = require("../src/engine/taskmap/native-candidate-acceptance.js");
const agent_session_candidate_adapter_js_1 = require("../src/engine/taskmap/agent-session-candidate-adapter.js");
const agent_session_producer_freshness_js_1 = require("../src/engine/taskmap/agent-session-producer-freshness.js");
const agent_session_semantic_admission_js_1 = require("../src/engine/taskmap/agent-session-semantic-admission.js");
const taskmap_agent_session_extraction_fixture_js_1 = require("./taskmap-agent-session-extraction-fixture.js");
const calendar_candidate_adapter_js_1 = require("../src/engine/taskmap/calendar-candidate-adapter.js");
const meeting_producer_freshness_js_1 = require("../src/engine/taskmap/meeting-producer-freshness.js");
const native_candidate_review_js_1 = require("../src/engine/taskmap/native-candidate-review.js");
const native_semantic_builder_adapter_js_1 = require("../src/engine/taskmap/native-semantic-builder-adapter.js");
const native_candidate_review_cli_js_1 = require("../src/engine/taskmap/native-candidate-review-cli.js");
const semanticAdapter = __importStar(require("../src/engine/taskmap/native-semantic-builder-adapter.js"));
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const confirmed_owner_js_1 = require("./support/confirmed-owner.js");
const roots = [];
const AT = "2026-08-03T18:00:00.000Z";
const ASSESSED = "2026-08-03T18:01:00.000Z";
const CONFIRMED = "2026-08-03T18:01:30.000Z";
(0, node_test_1.afterEach)(() => {
    for (const root of roots.splice(0)) {
        (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
    }
});
function digest(value) {
    return (0, node_crypto_1.createHash)("sha256").update(value).digest("hex");
}
function binding() {
    return {
        connectionId: "task6-meeting-owner",
        sourceKind: "gemini_meet",
        tenantOrWorkspaceDigest: digest("task6-workspace"),
        accountOrPrincipalDigest: digest("task6-principal"),
        grantVersion: "grant-1",
    };
}
function evidence(speechActClass = "request", speechActActor = "self", suffix = "primary") {
    const kind = speechActClass === "decision"
        ? "decision"
        : speechActClass === "commitment"
            ? "commitment"
            : "action_item";
    const mentionIdentityDigest = digest(`mention:${suffix}`);
    return {
        kind,
        title: `Confirm task ${suffix}`,
        summary: `Confirm the bounded task ${suffix}.`,
        occurredAt: "2026-08-03T17:55:00.000Z",
        observedAt: "2026-08-03T17:59:00.000Z",
        status: "open",
        quality: "structured_generated",
        coverage: "partial",
        confidence: 0.82,
        objectRefs: [],
        speechActClass,
        speechActActor,
        mentionIdentityDigest,
        extractionEnvelopeDigest: digest(`envelope:${suffix}`),
    };
}
function context(speechActClass = "request", speechActActor = "self", owner = "task6-owner", suffix = "primary") {
    const ownerScopeDigest = (0, confirmed_owner_js_1.testOwnerScopeDigest)(owner);
    const snapshot = (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)({
        ownerScopeDigest,
        producedAt: AT,
        meetings: [{
                binding: binding(),
                documentId: `document-${owner}-${suffix}`,
                revisionId: "revision-1",
                contentDigest: digest(`content:${owner}:${suffix}`),
                modifiedAt: "2026-08-03T17:58:00.000Z",
                eventTime: "2026-08-03T17:55:00.000Z",
                observedAt: "2026-08-03T17:59:00.000Z",
                evidence: [evidence(speechActClass, speechActActor, suffix)],
            }],
    });
    const result = (0, meeting_producer_freshness_js_1.assessTaskMapMeetingProducerSnapshot)(snapshot, ASSESSED);
    const overlay = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateReview)({
        result,
        previous: null,
        expectedOwnerScopeDigest: ownerScopeDigest,
        assessedAt: ASSESSED,
    });
    const shelf = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateShelf)(result, overlay, ASSESSED);
    return { ownerScopeDigest, result, overlay, shelf, row: shelf.candidates[0] };
}
function promotionInput(source = context(), overrides = {}) {
    return {
        result: source.result,
        overlay: source.overlay,
        previousStore: null,
        expectedOwnerScopeDigest: source.ownerScopeDigest,
        assessedAt: ASSESSED,
        candidateId: source.row.candidateId,
        expectedCandidateRevisionDigest: source.row.candidateRevisionDigest,
        expectedStatementReferenceDigest: source.row.statementReferenceDigest,
        expectedEvidenceProofDigests: source.row.evidenceProofDigests,
        idempotencyKeyDigest: digest("explicit-owner-confirmation-1"),
        confirmedAt: CONFIRMED,
        ...overrides,
    };
}
function agentObservation(input) {
    const directive = input.directive ?? "Implement proposal adoption";
    const rows = [
        {
            timestamp: "2026-08-03T17:50:00.000Z",
            type: "session_meta",
            payload: { id: input.session },
        },
    ];
    if (input.includeRoute !== false) {
        rows.push({
            timestamp: "2026-08-03T17:51:00.000Z",
            type: "turn_context",
            payload: {
                cwd: "/Users/reviewer/DaobrewAI",
                workspace_roots: ["/Users/reviewer/DaobrewAI"],
            },
        });
    }
    rows.push({
        timestamp: "2026-08-03T17:52:00.000Z",
        type: "response_item",
        payload: {
            id: `${input.session}-turn`,
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: directive }],
        },
    }, {
        timestamp: "2026-08-03T17:53:00.000Z",
        type: "response_item",
        payload: {
            type: "message",
            role: "assistant",
            content: [{
                    type: "output_text",
                    text: input.outcome ?? "Prepared the adoption implementation.",
                }],
        },
    });
    if (input.terminalLatest === true) {
        rows.push({
            timestamp: "2026-08-03T17:54:00.000Z",
            type: "response_item",
            payload: {
                id: `${input.session}-terminal`,
                type: "message",
                role: "user",
                content: [{ type: "input_text", text: "quit" }],
            },
        });
    }
    return {
        provider: "codex",
        rawJsonl: `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
    };
}
function agentContext(input = {}) {
    const ownerScopeDigest = (0, confirmed_owner_js_1.testOwnerScopeDigest)(input.owner ?? "task8-owner");
    const snapshot = (0, agent_session_producer_freshness_js_1.buildTaskMapAgentSessionProducerSnapshot)({
        ownerScopeDigest,
        producedAt: AT,
        observations: input.observations ?? [agentObservation({ session: "agent-a" })],
    });
    const admission = (0, agent_session_semantic_admission_js_1.buildTaskMapAgentSessionSemanticAdmission)(snapshot);
    const extraction = (0, taskmap_agent_session_extraction_fixture_js_1.buildAgentSessionExtractionFixture)(admission, ASSESSED);
    const projection = (0, agent_session_candidate_adapter_js_1.buildTaskMapAgentSessionCandidateReview)({
        admission,
        extraction,
        previous: null,
        expectedOwnerScopeDigest: ownerScopeDigest,
        assessedAt: ASSESSED,
    });
    return {
        ownerScopeDigest,
        admission,
        extraction,
        row: projection.shelf.candidates[0],
        shelf: projection.shelf,
        overlay: projection.overlay,
    };
}
function agentPromotionInput(source = agentContext(), overrides = {}) {
    assert.ok(source.row);
    return {
        admission: source.admission,
        extraction: source.extraction,
        overlay: source.overlay,
        previousStore: null,
        expectedOwnerScopeDigest: source.ownerScopeDigest,
        expectedAcceptanceHeadDigest: (0, native_candidate_acceptance_js_1.taskMapNativeCandidateAcceptanceHeadDigest)(null),
        assessedAt: ASSESSED,
        candidateId: source.row.candidateId,
        expectedCandidateRevisionDigest: source.row.candidateRevisionDigest,
        expectedStatementReferenceDigest: source.row.statementReferenceDigest,
        expectedEvidenceProofDigests: source.row.evidenceProofDigests,
        idempotencyKeyDigest: digest("task8-owner-adoption"),
        confirmedAt: CONFIRMED,
        ...overrides,
    };
}
function calendarContext(owner = "task8-calendar-owner") {
    const ownerScopeDigest = (0, confirmed_owner_js_1.testOwnerScopeDigest)(owner);
    const event = {
        provider: "local_calendar",
        eventIdentityDigest: digest("calendar-event"),
        crossProviderIdentityDigest: null,
        revisionDigest: digest("calendar-revision"),
        title: "Review calendar launch",
        startAt: "2026-08-03T17:45:00.000Z",
        endAt: "2026-08-03T18:15:00.000Z",
    };
    const result = {
        contractVersion: "taskmap-calendar-producer-result.v1",
        resultDigest: digest("calendar-result"),
        ownerScopeDigest,
        availability: "available",
        assessedAt: ASSESSED,
        providers: [],
        events: [event],
        privacy: {
            boundedTitlesStored: true,
            attendeesStored: false,
            locationsStored: false,
            notesStored: false,
            urlsStored: false,
            rawProviderIdsStored: false,
            credentialsStored: false,
            localPathsStored: false,
        },
    };
    const mentionIdentityDigest = digest("calendar-mention");
    const reportBase = {
        contractVersion: "taskmap-calendar-extraction-report.v1",
        ownerScopeDigest,
        resultDigest: result.resultDigest,
        promptTemplateDigest: digest("calendar-prompt"),
        assessedAt: ASSESSED,
        segments: [{
                segmentIndex: 0,
                inputDigest: digest("calendar-input"),
                eventIdentityDigests: [event.eventIdentityDigest],
                status: "extracted",
                degradationCode: null,
                envelopeDigest: digest("calendar-envelope"),
                envelopeModel: "fixture-model",
                envelopeTransport: "claude-cli",
                mentions: [{
                        text: "Review calendar launch",
                        title: "Review calendar launch",
                        speechActClass: "request",
                        speechActActor: "self",
                        confidence: 0.92,
                        mentionIdentityDigest,
                        proposalDisposition: "candidate_only",
                        promotionEligible: true,
                    }],
            }],
        pendingCount: 0,
    };
    const extraction = {
        ...reportBase,
        reportDigest: (0, source_contracts_js_1.taskMapContractDigest)(reportBase),
    };
    const projection = (0, calendar_candidate_adapter_js_1.buildTaskMapCalendarCandidateReview)({
        result,
        extraction,
        previous: null,
        expectedOwnerScopeDigest: ownerScopeDigest,
        assessedAt: ASSESSED,
    });
    return {
        ownerScopeDigest,
        result,
        extraction,
        overlay: projection.overlay,
        shelf: projection.shelf,
        row: projection.shelf.candidates[0],
    };
}
function tempStorePath() {
    const root = (0, node_fs_1.mkdtempSync)(node_path_1.default.join(process.cwd(), ".task6-acceptance-"));
    roots.push(root);
    const parent = node_path_1.default.join(root, "taskmap");
    (0, node_fs_1.mkdirSync)(parent, { mode: 0o700 });
    (0, node_fs_1.chmodSync)(parent, 0o700);
    return node_path_1.default.join(parent, "native-candidate-acceptance.v1.json");
}
function promoteDistinctCandidate(previousStore, suffix, confirmedAt) {
    const source = context("request", "self", "task6-owner", suffix);
    return (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)(promotionInput(source, {
        previousStore,
        idempotencyKeyDigest: digest(`explicit-owner-confirmation:${suffix}`),
        confirmedAt,
    }));
}
function coordinatedRehash(store) {
    const rehashed = structuredClone(store);
    const receipt = rehashed.receipts[0];
    const { promotionId: _promotionId, promotionDigest: _promotionDigest, ...receiptCore } = receipt;
    receipt.promotionDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: "taskmap-native-candidate-promotion.1",
        ...receiptCore,
    });
    receipt.promotionId = `tmcandidatepromotion_${receipt.promotionDigest}`;
    rehashed.headReceiptDigest = receipt.promotionDigest;
    return rehashed;
}
function acceptanceOptions(store) {
    return {
        candidateAcceptanceStore: store,
    };
}
function rekeyManualAuthority(input, suffix) {
    const forged = structuredClone(input);
    const pointer = forged.taskMapInput.pointers.find((item) => item.sourceKind === "manual");
    const event = forged.taskMapInput.events.find((item) => item.pointerId === pointer.id);
    const sourceBinding = forged.sourceBindings.find((item) => item.pointerId === pointer.id);
    const evidenceBinding = forged.evidenceBindings.find((item) => item.eventId === event.id);
    const pointerId = `forged-manual-${suffix}`;
    const eventId = `forged-manual-event-${suffix}`;
    const forgedDigest = digest(`forged-manual-authority:${suffix}`);
    pointer.id = pointerId;
    pointer.sourceObjectId = forgedDigest;
    pointer.sourceRefHash = forgedDigest;
    pointer.sourceVersion = forgedDigest;
    event.id = eventId;
    event.pointerId = pointerId;
    event.objectRefs = [`external:${forgedDigest}`];
    sourceBinding.pointerId = pointerId;
    sourceBinding.semanticOriginId = forgedDigest;
    sourceBinding.semanticIdentityDigest = forgedDigest;
    sourceBinding.sourceIdentityDigest = forgedDigest;
    sourceBinding.observedRevision = forgedDigest;
    sourceBinding.evidenceRevision = forgedDigest;
    sourceBinding.observedContentDigest = forgedDigest;
    sourceBinding.evidenceContentDigest = forgedDigest;
    evidenceBinding.eventId = eventId;
    evidenceBinding.rootLinkRefs = [`external:${forgedDigest}`];
    return forged;
}
(0, node_test_1.describe)("Task Map owner-confirmed candidate acceptance", () => {
    (0, node_test_1.it)("promotes calendar proof, filters rebuilt rows, and merges accepted work without resurrection", () => {
        const source = calendarContext();
        const promoted = (0, native_candidate_acceptance_js_1.promoteTaskMapCalendarCandidate)({
            result: source.result,
            extraction: source.extraction,
            overlay: source.overlay,
            previousStore: null,
            expectedOwnerScopeDigest: source.ownerScopeDigest,
            expectedAcceptanceHeadDigest: (0, native_candidate_acceptance_js_1.taskMapNativeCandidateAcceptanceHeadDigest)(null),
            assessedAt: ASSESSED,
            candidateId: source.row.candidateId,
            expectedCandidateRevisionDigest: source.row.candidateRevisionDigest,
            expectedStatementReferenceDigest: source.row.statementReferenceDigest,
            expectedEvidenceProofDigests: source.row.evidenceProofDigests,
            idempotencyKeyDigest: digest("calendar-owner-adoption"),
            confirmedAt: CONFIRMED,
        });
        assert.equal(promoted.receipt.accepted.title, "Review calendar launch");
        const rebuiltCalendarRows = (0, calendar_candidate_adapter_js_1.buildTaskMapCalendarCandidateReview)({
            result: source.result,
            extraction: source.extraction,
            previous: source.overlay,
            expectedOwnerScopeDigest: source.ownerScopeDigest,
            assessedAt: ASSESSED,
        }).shelf.candidates;
        assert.deepEqual((0, native_candidate_acceptance_js_1.filterTaskMapNativeCandidateShelfAgainstAcceptanceStore)(rebuiltCalendarRows, promoted.store, source.ownerScopeDigest, new Set()), rebuiltCalendarRows, "a durable receipt must stay visible until a verified projection publishes its promotion");
        assert.deepEqual((0, native_candidate_acceptance_js_1.filterTaskMapNativeCandidateShelfAgainstAcceptanceStore)(rebuiltCalendarRows, promoted.store, source.ownerScopeDigest, new Set([promoted.receipt.promotionId])), []);
        const sourceRotated = (0, native_candidate_review_cli_js_1.retainReceiptBackedPendingRows)([], promoted.store, new Set());
        assert.deepEqual(sourceRotated.durableConfirmedCandidateIds, [
            promoted.receipt.candidateId,
        ]);
        assert.equal(sourceRotated.candidates.length, 1);
        assert.deepEqual(sourceRotated.candidates[0], {
            candidateId: promoted.receipt.candidateId,
            candidateRevisionDigest: promoted.receipt.candidateRevisionDigest,
            statementReferenceDigest: promoted.receipt.statementReferenceDigest,
            evidenceProofDigests: promoted.receipt.evidenceProofDigests,
            candidateFamily: "accepted_pending",
            kind: promoted.receipt.accepted.kind,
            title: promoted.receipt.accepted.title,
            summary: promoted.receipt.accepted.summary,
            speechActClass: promoted.receipt.accepted.speechActClass,
            speechActActor: promoted.receipt.accepted.speechActActor,
            confidence: promoted.receipt.accepted.confidence,
            mentionIdentityDigest: promoted.receipt.accepted.mentionIdentityDigest,
            sourceKinds: ["accepted_pending"],
            occurredAt: promoted.receipt.accepted.occurredAt,
            observedAt: promoted.receipt.accepted.observedAt,
            reviewState: "unreviewed",
            reviewedAt: null,
            reviewedOnly: false,
            promotionEligible: false,
            acceptedWork: false,
            sourceWritebackEligible: false,
            rankEligible: false,
            routeEligible: false,
            proveEligible: false,
            runEligible: false,
        });
        const changedCurrentRow = structuredClone(rebuiltCalendarRows[0]);
        changedCurrentRow.candidateRevisionDigest = digest("changed-current-revision");
        changedCurrentRow.statementReferenceDigest = digest("changed-current-statement");
        changedCurrentRow.evidenceProofDigests = [digest("changed-current-proof")];
        const changedEvidence = (0, native_candidate_review_cli_js_1.retainReceiptBackedPendingRows)([changedCurrentRow], promoted.store, new Set());
        assert.deepEqual(changedEvidence.candidates, sourceRotated.candidates, "changed producer evidence must not impersonate the receipt-bound adopted task");
        assert.deepEqual((0, native_candidate_review_cli_js_1.retainReceiptBackedPendingRows)([], promoted.store, new Set([promoted.receipt.promotionId])), { candidates: [], durableConfirmedCandidateIds: [] }, "a verified accepted projection takes over the receipt-backed row");
        const meeting = context("request", "self", "task8-calendar-owner");
        const merged = (0, native_candidate_acceptance_js_1.mergeTaskMapNativeCandidateAcceptanceIntoSemanticInput)((0, native_semantic_builder_adapter_js_1.taskMapNativeSemanticInputFromMeetingProducerResult)(meeting.result, source.ownerScopeDigest), promoted.store);
        assert.ok(merged.taskMapInput.pointers.some((pointer) => pointer.id === `tmcandidatepromotion_${promoted.receipt.promotionDigest}`
            && pointer.sourceKind === "manual"));
    });
    (0, node_test_1.it)("coexists as one meeting, Agent Session, and Calendar review queue and promotes all three without resurrection", () => {
        const owner = "task9-three-source-owner";
        const meeting = context("request", "self", owner, "task9-meeting");
        const agent = agentContext({
            owner,
            observations: [agentObservation({
                    session: "task9-agent",
                    directive: "Prepare the Task 9 agent launch",
                })],
        });
        const calendar = calendarContext(owner);
        assert.ok(agent.row);
        const queue = [meeting.row, agent.row, calendar.row];
        assert.deepEqual(["meeting", agent.row.candidateFamily, calendar.row.candidateFamily]
            .sort(), ["agent_session", "calendar", "meeting"]);
        assert.deepEqual(meeting.row.sourceKinds, ["gemini_meet"]);
        assert.deepEqual(agent.row.sourceKinds, ["codex_session"]);
        assert.deepEqual(calendar.row.sourceKinds, ["calendar"]);
        assert.ok(queue.every((row) => !row.acceptedWork
            && !row.rankEligible
            && !row.routeEligible
            && !row.proveEligible
            && !row.runEligible));
        const promotedMeeting = (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)(promotionInput(meeting, {
            idempotencyKeyDigest: digest("task9-meeting-confirmation"),
        }));
        const promotedAgent = (0, native_candidate_acceptance_js_1.promoteTaskMapAgentSessionCandidate)(agentPromotionInput(agent, {
            previousStore: promotedMeeting.store,
            expectedAcceptanceHeadDigest: (0, native_candidate_acceptance_js_1.taskMapNativeCandidateAcceptanceHeadDigest)(promotedMeeting.store),
            idempotencyKeyDigest: digest("task9-agent-confirmation"),
        }));
        const promotedCalendar = (0, native_candidate_acceptance_js_1.promoteTaskMapCalendarCandidate)({
            result: calendar.result,
            extraction: calendar.extraction,
            overlay: calendar.overlay,
            previousStore: promotedAgent.store,
            expectedOwnerScopeDigest: calendar.ownerScopeDigest,
            expectedAcceptanceHeadDigest: (0, native_candidate_acceptance_js_1.taskMapNativeCandidateAcceptanceHeadDigest)(promotedAgent.store),
            assessedAt: ASSESSED,
            candidateId: calendar.row.candidateId,
            expectedCandidateRevisionDigest: calendar.row.candidateRevisionDigest,
            expectedStatementReferenceDigest: calendar.row.statementReferenceDigest,
            expectedEvidenceProofDigests: calendar.row.evidenceProofDigests,
            idempotencyKeyDigest: digest("task9-calendar-confirmation"),
            confirmedAt: CONFIRMED,
        });
        assert.equal(promotedCalendar.store.receipts.length, 3);
        for (const source of [meeting, agent, calendar]) {
            assert.deepEqual((0, native_candidate_acceptance_js_1.filterTaskMapNativeCandidateShelfAgainstAcceptanceStore)(source.shelf.candidates, promotedCalendar.store, source.ownerScopeDigest), []);
        }
        const merged = (0, native_candidate_acceptance_js_1.mergeTaskMapNativeCandidateAcceptanceIntoSemanticInput)((0, native_semantic_builder_adapter_js_1.taskMapNativeSemanticInputFromMeetingProducerResult)(meeting.result, meeting.ownerScopeDigest), promotedCalendar.store);
        const projection = (0, native_semantic_builder_adapter_js_1.buildTaskMapNativeSemanticProjection)(merged, acceptanceOptions(promotedCalendar.store));
        const promotionPointerIds = new Set(promotedCalendar.store.receipts.map((receipt) => `tmcandidatepromotion_${receipt.promotionDigest}`));
        const promotedTasks = projection.tasks.filter((task) => task.taskHomePointerId !== undefined
            && promotionPointerIds.has(task.taskHomePointerId));
        assert.equal(promotedTasks.length, 3);
        assert.ok(promotedTasks.every((task) => task.reviewState === "accepted"
            && task.authority === "user"
            && task.citations[0]?.sourceKind === "manual"));
        assert.deepEqual(projection.sources
            .filter((pointer) => promotionPointerIds.has(pointer.id))
            .map((pointer) => pointer.sourceKind), ["manual", "manual", "manual"]);
    });
    (0, node_test_1.it)("adopts a freshly resolved agent proposal through the current v1 receipt head only", () => {
        const firstSource = agentContext({
            observations: [agentObservation({
                    session: "agent-first",
                    directive: "Prepare the first owner task",
                })],
        });
        const first = (0, native_candidate_acceptance_js_1.promoteTaskMapAgentSessionCandidate)(agentPromotionInput(firstSource, {
            idempotencyKeyDigest: digest("task8-first-adoption"),
        }));
        const secondSource = agentContext({
            observations: [agentObservation({
                    session: "agent-second",
                    directive: "Prepare the second owner task",
                })],
        });
        const admissionBefore = (0, source_contracts_js_1.taskMapContractCanonicalJson)(secondSource.admission);
        const promoted = (0, native_candidate_acceptance_js_1.promoteTaskMapAgentSessionCandidate)(agentPromotionInput(secondSource, {
            previousStore: first.store,
            expectedAcceptanceHeadDigest: first.store.headReceiptDigest,
            idempotencyKeyDigest: digest("task8-second-adoption"),
        }));
        assert.equal(promoted.store.contractVersion, "taskmap-native-candidate-acceptance.v1");
        assert.equal(promoted.store.receipts.length, 2);
        assert.equal(promoted.receipt.previousReceiptDigest, first.store.headReceiptDigest);
        assert.deepEqual(promoted.receipt.authority, {
            sourceKind: "manual",
            authority: "user",
            syncMode: "personal_fork",
            capabilities: ["read_task"],
            recordKind: "authoritative_task",
            lifecycle: "explicit_user_policy",
            sourceStatus: "open",
        });
        assert.equal(promoted.receipt.sourceWritebackAttempted, false);
        assert.equal(promoted.receipt.accepted.kind, "action_item");
        assert.equal(promoted.receipt.accepted.speechActClass, "request");
        assert.equal(promoted.receipt.accepted.speechActActor, "self");
        assert.equal(secondSource.row.candidateFamily, "agent_session");
        if (secondSource.row.candidateFamily !== "agent_session")
            assert.fail();
        assert.equal(promoted.receipt.accepted.mentionIdentityDigest, secondSource.row.mentionIdentityDigest);
        assert.equal((0, source_contracts_js_1.taskMapContractCanonicalJson)(secondSource.admission), admissionBefore, "adoption must not mutate proposal evidence");
        const receiptBytes = (0, source_contracts_js_1.taskMapContractCanonicalJson)(promoted.receipt);
        for (const forbidden of [
            "approve",
            "export",
            "selectedAgent",
            "processId",
            "command",
            "sourceWritebackEligible",
        ]) {
            assert.equal(receiptBytes.includes(forbidden), false, forbidden);
        }
    });
    (0, node_test_1.it)("re-resolves agent identity, support revision, statement, and evidence at mutation time", () => {
        const observed = agentContext();
        const current = agentContext({
            observations: [
                agentObservation({ session: "agent-a" }),
                agentObservation({ session: "agent-b" }),
            ],
        });
        assert.equal(current.row.candidateId, observed.row.candidateId);
        assert.notEqual(current.row.candidateRevisionDigest, observed.row.candidateRevisionDigest);
        assert.throws(() => (0, native_candidate_acceptance_js_1.promoteTaskMapAgentSessionCandidate)(agentPromotionInput(current, {
            expectedCandidateRevisionDigest: observed.row.candidateRevisionDigest,
            expectedStatementReferenceDigest: observed.row.statementReferenceDigest,
            expectedEvidenceProofDigests: observed.row.evidenceProofDigests,
        })), /exact current agent candidate proof does not match confirmation/);
        const changedCluster = agentContext({
            observations: [agentObservation({
                    session: "agent-a",
                    directive: "Implement a different proposal",
                })],
        });
        assert.throws(() => (0, native_candidate_acceptance_js_1.promoteTaskMapAgentSessionCandidate)(agentPromotionInput(changedCluster, {
            candidateId: observed.row.candidateId,
            expectedCandidateRevisionDigest: observed.row.candidateRevisionDigest,
            expectedStatementReferenceDigest: observed.row.statementReferenceDigest,
            expectedEvidenceProofDigests: observed.row.evidenceProofDigests,
        })), /agent candidate is unavailable/);
    });
    (0, node_test_1.it)("rejects a currently dismissed agent proposal while preserving unreviewed compatibility", () => {
        const source = agentContext();
        const context = {
            ownerScopeDigest: source.ownerScopeDigest,
            producerResultDigest: source.extraction.reportDigest,
            producerSnapshotDigest: source.admission.sourceSnapshotDigest,
            producedAt: source.admission.producedAt,
            assessedAt: ASSESSED,
            candidates: source.shelf.candidates,
        };
        const dismissed = (0, native_candidate_review_js_1.reduceTaskMapNativeCandidateReviewFromProofRows)({
            context,
            overlay: source.overlay,
            candidateId: source.row.candidateId,
            expectedCandidateRevisionDigest: source.row.candidateRevisionDigest,
            action: "dismiss",
            idempotencyKeyDigest: digest("task8-dismiss-agent"),
            decidedAt: ASSESSED,
        });
        assert.throws(() => (0, native_candidate_acceptance_js_1.promoteTaskMapAgentSessionCandidate)(agentPromotionInput(source, { overlay: dismissed })), /dismissed|unavailable/);
        assert.doesNotThrow(() => (0, native_candidate_acceptance_js_1.promoteTaskMapAgentSessionCandidate)(agentPromotionInput(source, { overlay: null })), "A missing overlay keeps the existing unreviewed adoption path.");
    });
    (0, node_test_1.it)("rejects wrong owner, stale admission, disappeared route, and disposed latest row", () => {
        const source = agentContext();
        assert.throws(() => (0, native_candidate_acceptance_js_1.promoteTaskMapAgentSessionCandidate)(agentPromotionInput(source, {
            expectedOwnerScopeDigest: (0, confirmed_owner_js_1.testOwnerScopeDigest)("another-owner"),
        })), /another owner/);
        assert.throws(() => (0, native_candidate_acceptance_js_1.promoteTaskMapAgentSessionCandidate)(agentPromotionInput(source, {
            assessedAt: "2026-08-03T22:01:00.000Z",
        })), /stale/);
        for (const unavailable of [
            agentContext({
                observations: [agentObservation({
                        session: "agent-a",
                        includeRoute: false,
                    })],
            }),
            agentContext({
                observations: [agentObservation({
                        session: "agent-a",
                        terminalLatest: true,
                    })],
            }),
        ]) {
            assert.equal(unavailable.admission.clusters.length, 0);
            assert.throws(() => (0, native_candidate_acceptance_js_1.promoteTaskMapAgentSessionCandidate)(agentPromotionInput(source, {
                admission: unavailable.admission,
                extraction: unavailable.extraction,
            })), /agent candidate is unavailable/);
        }
    });
    (0, node_test_1.it)("rejects duplicate adoption, receipt-head mismatch, and v1 candidate rebinding", () => {
        const source = agentContext();
        const first = (0, native_candidate_acceptance_js_1.promoteTaskMapAgentSessionCandidate)(agentPromotionInput(source));
        assert.throws(() => (0, native_candidate_acceptance_js_1.promoteTaskMapAgentSessionCandidate)(agentPromotionInput(source, {
            previousStore: first.store,
            expectedAcceptanceHeadDigest: first.store.headReceiptDigest,
            idempotencyKeyDigest: digest("different-task8-key"),
        })), /already promoted/);
        assert.throws(() => (0, native_candidate_acceptance_js_1.promoteTaskMapAgentSessionCandidate)(agentPromotionInput(agentContext({
            observations: [agentObservation({
                    session: "agent-next",
                    directive: "Prepare another task",
                })],
        }), {
            previousStore: first.store,
            expectedAcceptanceHeadDigest: digest("stale-head"),
        })), /receipt head does not match/);
        const meeting = context();
        assert.throws(() => (0, native_candidate_acceptance_js_1.promoteTaskMapAgentSessionCandidate)(agentPromotionInput(source, {
            candidateId: meeting.row.candidateId,
            expectedCandidateRevisionDigest: meeting.row.candidateRevisionDigest,
            expectedStatementReferenceDigest: meeting.row.statementReferenceDigest,
            expectedEvidenceProofDigests: meeting.row.evidenceProofDigests,
        })), /agent candidate is unavailable/);
    });
    (0, node_test_1.it)("rejects coordinated rehashed stores containing standalone privacy leaks", () => {
        const accepted = (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)(promotionInput());
        for (const leak of [
            "Contact owner@example.com",
            "Review https://example.com/private",
            "Open file:///Users/owner/private.txt",
            "Use token=abcdef123456",
            "Rotate ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ",
            "Inspect eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvd25lciJ9.signature123456",
            "Open /Users/owner/private.txt",
            String.raw `Open C:\Users\owner\private.txt`,
            String.raw `Open \\server\share\private.txt`,
        ]) {
            const draft = structuredClone(accepted.store);
            draft.receipts[0].accepted.summary = leak;
            assert.throws(() => (0, native_candidate_acceptance_js_1.assertTaskMapNativeCandidateAcceptanceStore)(coordinatedRehash(draft)), /privacy|canonical|bounded text/i, leak);
        }
    });
    (0, node_test_1.it)("rejects coordinated rehashed stores with noncanonical display whitespace", () => {
        const accepted = (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)(promotionInput());
        for (const displayText of [
            " Leading whitespace",
            "Repeated  whitespace",
            "Trailing whitespace ",
            "Nonbreaking\u00a0whitespace",
        ]) {
            const draft = structuredClone(accepted.store);
            draft.receipts[0].accepted.title = displayText;
            assert.throws(() => (0, native_candidate_acceptance_js_1.assertTaskMapNativeCandidateAcceptanceStore)(coordinatedRehash(draft)), /canonical|bounded text/i, displayText);
        }
    });
    (0, node_test_1.it)("rejects the complete bidi-control set in coordinated rehashed durable text", () => {
        const accepted = (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)(promotionInput());
        const bidiControls = [
            "\u061c",
            "\u200e",
            "\u200f",
            "\u202a",
            "\u202b",
            "\u202c",
            "\u202d",
            "\u202e",
            "\u2066",
            "\u2067",
            "\u2068",
            "\u2069",
        ];
        for (const field of ["title", "summary"]) {
            for (const control of bidiControls) {
                const unsafeText = `Review ${control}context`;
                const draft = structuredClone(accepted.store);
                draft.receipts[0].accepted[field] = unsafeText;
                assert.throws(() => (0, native_candidate_acceptance_js_1.assertTaskMapNativeCandidateAcceptanceStore)(coordinatedRehash(draft)), /display|meaningful|bidi|bounded text/i, `${field}: ${JSON.stringify(unsafeText)}`);
            }
        }
    });
    (0, node_test_1.it)("rejects every Unicode Cc scalar in coordinated rehashed durable text", () => {
        const accepted = (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)(promotionInput());
        const allUnicodeControlCharacters = [
            ...Array.from({ length: 0x20 }, (_, codePoint) => String.fromCodePoint(codePoint)),
            ...Array.from({ length: 0x21 }, (_, offset) => String.fromCodePoint(0x7f + offset)),
        ];
        const unicodeControlCharacters = [
            "\u009b",
            ...allUnicodeControlCharacters.filter((control) => control !== "\u009b"),
        ];
        for (const field of ["title", "summary"]) {
            for (const control of unicodeControlCharacters) {
                const draft = structuredClone(accepted.store);
                draft.receipts[0].accepted[field] = `Review ${control}context`;
                assert.throws(() => (0, native_candidate_acceptance_js_1.assertTaskMapNativeCandidateAcceptanceStore)(coordinatedRehash(draft)), /display|control|bounded text/i, `${field}: U+${control.codePointAt(0).toString(16).padStart(4, "0")}`);
            }
        }
    });
    (0, node_test_1.it)("rejects coordinated rehashed durable text without a meaningful scalar", () => {
        const accepted = (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)(promotionInput());
        for (const field of ["title", "summary"]) {
            const draft = structuredClone(accepted.store);
            draft.receipts[0].accepted[field] = "\u200b\u200d";
            assert.throws(() => (0, native_candidate_acceptance_js_1.assertTaskMapNativeCandidateAcceptanceStore)(coordinatedRehash(draft)), /display|meaningful|bounded text/i, field);
        }
    });
    (0, node_test_1.it)("rejects default-ignorable marks without a meaningful scalar after coordinated rehash", () => {
        const accepted = (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)(promotionInput());
        const defaultIgnorableMarks = [
            "\ufe0e",
            "\ufe0f",
            "\u{e0100}",
            "\u034f",
            "\u180b",
        ];
        for (const field of ["title", "summary"]) {
            for (const unsafeText of defaultIgnorableMarks) {
                const draft = structuredClone(accepted.store);
                draft.receipts[0].accepted[field] = unsafeText;
                assert.throws(() => (0, native_candidate_acceptance_js_1.assertTaskMapNativeCandidateAcceptanceStore)(coordinatedRehash(draft)), /display|meaningful|bounded text/i, `${field}: ${JSON.stringify(unsafeText)}`);
            }
        }
    });
    (0, node_test_1.it)("preserves legitimate emoji and Indic format controls in durable text", () => {
        const accepted = (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)(promotionInput());
        const legitimateText = "Review ✈️, 👩‍💻, and क्‍ष output";
        const draft = structuredClone(accepted.store);
        draft.receipts[0].accepted.title = legitimateText;
        draft.receipts[0].accepted.summary = legitimateText;
        assert.doesNotThrow(() => (0, native_candidate_acceptance_js_1.assertTaskMapNativeCandidateAcceptanceStore)(coordinatedRehash(draft)));
    });
    (0, node_test_1.it)("rejects coordinated rehashed stores observed before occurrence", () => {
        const accepted = (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)(promotionInput());
        const draft = structuredClone(accepted.store);
        draft.receipts[0].accepted.occurredAt =
            "2026-08-03T18:00:00.000Z";
        draft.receipts[0].accepted.observedAt =
            "2026-08-03T17:59:00.000Z";
        assert.throws(() => (0, native_candidate_acceptance_js_1.assertTaskMapNativeCandidateAcceptanceStore)(coordinatedRehash(draft)), /chronology|timestamp/i);
    });
    (0, node_test_1.it)("resolves the exact authenticated current proof without changing review overlay bytes", () => {
        const source = context();
        const before = (0, native_candidate_review_js_1.taskMapNativeCandidateReviewCanonicalBytes)(source.overlay);
        const proof = (0, native_candidate_review_js_1.resolveTaskMapNativeCandidateProof)({
            result: source.result,
            overlay: source.overlay,
            expectedOwnerScopeDigest: source.ownerScopeDigest,
            assessedAt: ASSESSED,
            candidateId: source.row.candidateId,
        });
        assert.deepEqual(proof, source.row);
        assert.equal((0, native_candidate_review_js_1.taskMapNativeCandidateReviewCanonicalBytes)(source.overlay), before);
    });
    (0, node_test_1.it)("rejects an otherwise eligible caller-fabricated raw occurrence", () => {
        const source = context();
        assert.throws(() => (0, native_candidate_review_js_1.resolveTaskMapNativeCandidateProof)({
            result: source.result,
            overlay: source.overlay,
            expectedOwnerScopeDigest: source.ownerScopeDigest,
            assessedAt: ASSESSED,
            candidateId: source.row.candidateId,
            authenticatedOccurrences: [{
                    statementReferenceDigest: source.row.statementReferenceDigest,
                    evidenceProofDigest: digest("fabricated-eligible-proof"),
                    kind: "action_item",
                    title: source.row.title,
                    summary: source.row.summary,
                    speechActClass: "request",
                    speechActActor: "self",
                    mentionIdentityDigest: source.row.mentionIdentityDigest,
                    confidence: source.row.confidence,
                    promotionEligible: true,
                    sourceKind: "granola",
                    occurredAt: source.row.occurredAt,
                    observedAt: source.row.observedAt,
                }],
        }), /unsupported or missing fields/);
    });
    (0, node_test_1.it)("accepts only eligible request-self and commitment-self proofs", () => {
        for (const speechActClass of ["request", "commitment"]) {
            const source = context(speechActClass, "self", `owner-${speechActClass}`);
            const accepted = (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)(promotionInput(source));
            assert.equal(accepted.receipt.accepted.speechActClass, speechActClass);
            assert.equal(accepted.receipt.accepted.speechActActor, "self");
            assert.equal(accepted.receipt.authority.sourceKind, "manual");
            assert.equal(accepted.receipt.authority.authority, "user");
            assert.equal(accepted.receipt.authority.syncMode, "personal_fork");
            assert.deepEqual(accepted.receipt.authority.capabilities, ["read_task"]);
            assert.equal(accepted.receipt.authority.recordKind, "authoritative_task");
            assert.equal(accepted.receipt.authority.lifecycle, "explicit_user_policy");
            assert.equal(accepted.receipt.sourceWritebackAttempted, false);
        }
    });
    (0, node_test_1.it)("rejects every ineligible class/actor cell", () => {
        for (const speechActClass of ["request", "commitment", "decision", "other"]) {
            for (const actor of ["self", "other", "unknown"]) {
                if ((speechActClass === "request" || speechActClass === "commitment") && actor === "self")
                    continue;
                const source = context(speechActClass, actor, `${speechActClass}-${actor}`);
                assert.throws(() => (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)(promotionInput(source)), /not promotion eligible/);
            }
        }
    });
    (0, node_test_1.it)("rejects stale, missing, dismissed, wrong-owner, and exact-proof mismatches", () => {
        const source = context();
        for (const [field, value] of [
            ["candidateId", `tmnativecandidate_${"f".repeat(64)}`],
            ["expectedCandidateRevisionDigest", digest("stale")],
            ["expectedStatementReferenceDigest", digest("wrong-statement")],
            ["expectedEvidenceProofDigests", [digest("wrong-proof")]],
            ["expectedOwnerScopeDigest", (0, confirmed_owner_js_1.testOwnerScopeDigest)("wrong-owner")],
        ]) {
            assert.throws(() => (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)(promotionInput(source, { [field]: value })), /candidate acceptance|candidate review/i);
        }
        const dismissed = (0, native_candidate_review_js_1.reduceTaskMapNativeCandidateReview)({
            result: source.result,
            overlay: source.overlay,
            expectedOwnerScopeDigest: source.ownerScopeDigest,
            assessedAt: ASSESSED,
            candidateId: source.row.candidateId,
            expectedCandidateRevisionDigest: source.row.candidateRevisionDigest,
            action: "dismiss",
            idempotencyKeyDigest: digest("dismiss"),
            decidedAt: ASSESSED,
        });
        assert.throws(() => (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)(promotionInput(source, { overlay: dismissed })), /dismissed|not present/);
    });
    (0, node_test_1.it)("persists a bounded authenticated chain and replays identically after restart without producer state", async () => {
        const storePath = tempStorePath();
        const first = (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)(promotionInput());
        await (0, native_candidate_acceptance_js_1.writeTaskMapNativeCandidateAcceptanceStore)({
            storePath,
            expectedOwnerScopeDigest: first.store.ownerScopeDigest,
            store: first.store,
        });
        const loaded = await (0, native_candidate_acceptance_js_1.loadTaskMapNativeCandidateAcceptanceStore)({
            storePath,
            expectedOwnerScopeDigest: first.store.ownerScopeDigest,
        });
        assert.deepEqual(loaded, first.store);
        assert.equal((0, native_candidate_acceptance_js_1.taskMapNativeCandidateAcceptanceHeadDigest)(loaded), first.receipt.promotionDigest);
        const replay = (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)(promotionInput(context(), {
            result: null,
            overlay: null,
            previousStore: loaded,
            confirmedAt: "2026-08-03T19:00:00.000Z",
        }));
        assert.deepEqual(replay.receipt, first.receipt);
        assert.deepEqual(replay.store, first.store);
        assert.throws(() => (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)(promotionInput(context(), {
            result: null,
            overlay: null,
            previousStore: loaded,
            expectedStatementReferenceDigest: digest("conflict"),
        })), /idempotency key conflicts/);
        assert.throws(() => (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)(promotionInput(context(), {
            previousStore: loaded,
            idempotencyKeyDigest: digest("different-key"),
        })), /already promoted/);
        assert.ok(Buffer.byteLength((0, node_fs_1.readFileSync)(storePath)) < native_candidate_acceptance_js_1.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1.maxFileBytes);
    });
    (0, node_test_1.it)("loads a missing store without creating its parent directory", async () => {
        const root = (0, node_fs_1.mkdtempSync)(node_path_1.default.join(process.cwd(), ".task6-load-missing-"));
        roots.push(root);
        const parent = node_path_1.default.join(root, "missing-taskmap");
        const storePath = node_path_1.default.join(parent, "native-candidate-acceptance.v1.json");
        const loaded = await (0, native_candidate_acceptance_js_1.loadTaskMapNativeCandidateAcceptanceStore)({
            storePath,
            expectedOwnerScopeDigest: (0, confirmed_owner_js_1.testOwnerScopeDigest)("task6-owner"),
        });
        assert.equal(loaded, null);
        assert.equal((0, node_fs_1.existsSync)(parent), false);
    });
    (0, node_test_1.it)("treats an exact persisted-store replay as a byte-identical no-op", async () => {
        const storePath = tempStorePath();
        const first = promoteDistinctCandidate(null, "base", CONFIRMED);
        const input = {
            storePath,
            expectedOwnerScopeDigest: first.store.ownerScopeDigest,
            store: first.store,
        };
        await (0, native_candidate_acceptance_js_1.writeTaskMapNativeCandidateAcceptanceStore)(input);
        const before = (0, node_fs_1.statSync)(storePath, { bigint: true });
        const beforeBytes = (0, node_fs_1.readFileSync)(storePath);
        await (0, native_candidate_acceptance_js_1.writeTaskMapNativeCandidateAcceptanceStore)(input);
        const after = (0, node_fs_1.statSync)(storePath, { bigint: true });
        assert.deepEqual((0, node_fs_1.readFileSync)(storePath), beforeBytes);
        assert.equal(after.ino, before.ino);
        assert.equal(after.mtimeNs, before.mtimeNs);
    });
    (0, node_test_1.it)("rejects a canonical two-receipt initialization without creating its parent", async () => {
        const root = (0, node_fs_1.mkdtempSync)(node_path_1.default.join(process.cwd(), ".task6-genesis-missing-"));
        roots.push(root);
        const parent = node_path_1.default.join(root, "absent-taskmap");
        const storePath = node_path_1.default.join(parent, "native-candidate-acceptance.v1.json");
        assert.equal((0, node_fs_1.existsSync)(parent), false);
        const first = promoteDistinctCandidate(null, "base", CONFIRMED);
        const twoReceipts = promoteDistinctCandidate(first.store, "extension-a", "2026-08-03T18:02:00.000Z");
        assert.equal(twoReceipts.store.receipts.length, 2);
        assert.doesNotThrow(() => (0, native_candidate_acceptance_js_1.assertTaskMapNativeCandidateAcceptanceStore)(twoReceipts.store));
        await assert.rejects((0, native_candidate_acceptance_js_1.writeTaskMapNativeCandidateAcceptanceStore)({
            storePath,
            expectedOwnerScopeDigest: twoReceipts.store.ownerScopeDigest,
            store: twoReceipts.store,
        }), /initial|genesis|one receipt/i);
        assert.equal((0, node_fs_1.existsSync)(parent), false);
        assert.equal((0, node_fs_1.existsSync)(storePath), false);
    });
    (0, node_test_1.it)("rejects a stale rollback after a valid one-receipt extension", async () => {
        const storePath = tempStorePath();
        const first = promoteDistinctCandidate(null, "base", CONFIRMED);
        const extended = promoteDistinctCandidate(first.store, "extension-a", "2026-08-03T18:02:00.000Z");
        await (0, native_candidate_acceptance_js_1.writeTaskMapNativeCandidateAcceptanceStore)({
            storePath,
            expectedOwnerScopeDigest: first.store.ownerScopeDigest,
            store: first.store,
        });
        await (0, native_candidate_acceptance_js_1.writeTaskMapNativeCandidateAcceptanceStore)({
            storePath,
            expectedOwnerScopeDigest: extended.store.ownerScopeDigest,
            store: extended.store,
        });
        const extendedBytes = (0, node_fs_1.readFileSync)(storePath);
        await assert.rejects((0, native_candidate_acceptance_js_1.writeTaskMapNativeCandidateAcceptanceStore)({
            storePath,
            expectedOwnerScopeDigest: first.store.ownerScopeDigest,
            store: first.store,
        }), /append|stale|rollback|fork/i);
        assert.deepEqual((0, node_fs_1.readFileSync)(storePath), extendedBytes);
    });
    (0, node_test_1.it)("rejects a same-head fork after another extension wins", async () => {
        const storePath = tempStorePath();
        const first = promoteDistinctCandidate(null, "base", CONFIRMED);
        const extensionA = promoteDistinctCandidate(first.store, "extension-a", "2026-08-03T18:02:00.000Z");
        const extensionB = promoteDistinctCandidate(first.store, "extension-b", "2026-08-03T18:03:00.000Z");
        await (0, native_candidate_acceptance_js_1.writeTaskMapNativeCandidateAcceptanceStore)({
            storePath,
            expectedOwnerScopeDigest: first.store.ownerScopeDigest,
            store: first.store,
        });
        await (0, native_candidate_acceptance_js_1.writeTaskMapNativeCandidateAcceptanceStore)({
            storePath,
            expectedOwnerScopeDigest: extensionA.store.ownerScopeDigest,
            store: extensionA.store,
        });
        const winningBytes = (0, node_fs_1.readFileSync)(storePath);
        await assert.rejects((0, native_candidate_acceptance_js_1.writeTaskMapNativeCandidateAcceptanceStore)({
            storePath,
            expectedOwnerScopeDigest: extensionB.store.ownerScopeDigest,
            store: extensionB.store,
        }), /append|stale|rollback|fork/i);
        assert.deepEqual((0, node_fs_1.readFileSync)(storePath), winningBytes);
    });
    (0, node_test_1.it)("serializes concurrent stale writers so exactly one extension wins", async () => {
        const storePath = tempStorePath();
        const first = promoteDistinctCandidate(null, "base", CONFIRMED);
        const extensionA = promoteDistinctCandidate(first.store, "extension-a", "2026-08-03T18:02:00.000Z");
        const extensionB = promoteDistinctCandidate(first.store, "extension-b", "2026-08-03T18:03:00.000Z");
        await (0, native_candidate_acceptance_js_1.writeTaskMapNativeCandidateAcceptanceStore)({
            storePath,
            expectedOwnerScopeDigest: first.store.ownerScopeDigest,
            store: first.store,
        });
        const outcomes = await Promise.allSettled([extensionA, extensionB].map((extension) => (0, native_candidate_acceptance_js_1.writeTaskMapNativeCandidateAcceptanceStore)({
            storePath,
            expectedOwnerScopeDigest: extension.store.ownerScopeDigest,
            store: extension.store,
        })));
        assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
        assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 1);
        const rejected = outcomes.find((outcome) => outcome.status === "rejected");
        assert.ok(rejected?.status === "rejected");
        assert.match(String(rejected.reason), /append|stale|rollback|fork/i);
        const loaded = await (0, native_candidate_acceptance_js_1.loadTaskMapNativeCandidateAcceptanceStore)({
            storePath,
            expectedOwnerScopeDigest: first.store.ownerScopeDigest,
        });
        assert.ok((0, source_contracts_js_1.taskMapContractCanonicalJson)(loaded)
            === (0, source_contracts_js_1.taskMapContractCanonicalJson)(extensionA.store)
            || (0, source_contracts_js_1.taskMapContractCanonicalJson)(loaded)
                === (0, source_contracts_js_1.taskMapContractCanonicalJson)(extensionB.store));
    });
    (0, node_test_1.it)("rejects store tamper, symlinks, hardlinks, and unsafe modes without replacing safe bytes", async () => {
        const storePath = tempStorePath();
        const accepted = (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)(promotionInput());
        await (0, native_candidate_acceptance_js_1.writeTaskMapNativeCandidateAcceptanceStore)({
            storePath,
            expectedOwnerScopeDigest: accepted.store.ownerScopeDigest,
            store: accepted.store,
        });
        const safeBytes = (0, node_fs_1.readFileSync)(storePath, "utf8");
        (0, node_fs_1.chmodSync)(node_path_1.default.dirname(storePath), 0o755);
        await assert.rejects((0, native_candidate_acceptance_js_1.writeTaskMapNativeCandidateAcceptanceStore)({
            storePath,
            expectedOwnerScopeDigest: accepted.store.ownerScopeDigest,
            store: accepted.store,
        }), /0700 directory/);
        assert.equal((0, node_fs_1.readFileSync)(storePath, "utf8"), safeBytes);
        (0, node_fs_1.chmodSync)(node_path_1.default.dirname(storePath), 0o700);
        const tampered = JSON.parse(safeBytes);
        tampered.receipts[0].accepted.title = "tampered";
        assert.throws(() => (0, native_candidate_acceptance_js_1.assertTaskMapNativeCandidateAcceptanceStore)(tampered), /digest|chain/);
        (0, node_fs_1.chmodSync)(storePath, 0o644);
        await assert.rejects((0, native_candidate_acceptance_js_1.loadTaskMapNativeCandidateAcceptanceStore)({
            storePath,
            expectedOwnerScopeDigest: accepted.store.ownerScopeDigest,
        }), /authentication/);
        (0, node_fs_1.chmodSync)(storePath, 0o600);
        const peer = `${storePath}.peer`;
        (0, node_fs_1.linkSync)(storePath, peer);
        await assert.rejects((0, native_candidate_acceptance_js_1.loadTaskMapNativeCandidateAcceptanceStore)({
            storePath,
            expectedOwnerScopeDigest: accepted.store.ownerScopeDigest,
        }), /authentication/);
        (0, node_fs_1.unlinkSync)(peer);
        (0, node_fs_1.unlinkSync)(storePath);
        (0, node_fs_1.symlinkSync)(node_path_1.default.basename(peer), storePath);
        await assert.rejects((0, native_candidate_acceptance_js_1.writeTaskMapNativeCandidateAcceptanceStore)({
            storePath,
            expectedOwnerScopeDigest: accepted.store.ownerScopeDigest,
            store: accepted.store,
        }), /regular file|symbolic link|ELOOP/);
    });
    (0, node_test_1.it)("fails authenticated store reads on replacement and same-inode metadata races", async () => {
        for (const race of [
            "replace",
            "chmod",
            "hardlink",
            "mutate_restore_mtime",
            "overgrowth",
        ]) {
            const storePath = tempStorePath();
            const accepted = (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)(promotionInput());
            await (0, native_candidate_acceptance_js_1.writeTaskMapNativeCandidateAcceptanceStore)({
                storePath,
                expectedOwnerScopeDigest: accepted.store.ownerScopeDigest,
                store: accepted.store,
            });
            const safeBytes = (0, node_fs_1.readFileSync)(storePath);
            const initial = (0, node_fs_1.statSync)(storePath);
            await assert.rejects((0, native_candidate_acceptance_js_1.loadTaskMapNativeCandidateAcceptanceStore)({
                storePath,
                expectedOwnerScopeDigest: accepted.store.ownerScopeDigest,
                afterAuthenticatedReadForTesting: () => {
                    if (race === "replace") {
                        (0, node_fs_1.renameSync)(storePath, `${storePath}.replaced`);
                        (0, node_fs_1.writeFileSync)(storePath, safeBytes, { mode: 0o600 });
                    }
                    else if (race === "chmod") {
                        (0, node_fs_1.chmodSync)(storePath, 0o644);
                    }
                    else if (race === "hardlink") {
                        (0, node_fs_1.linkSync)(storePath, `${storePath}.peer`);
                    }
                    else if (race === "overgrowth") {
                        (0, node_fs_1.writeFileSync)(storePath, Buffer.alloc(native_candidate_acceptance_js_1.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1.maxFileBytes, 0x20), { flag: "a" });
                    }
                    else {
                        const descriptor = (0, node_fs_1.openSync)(storePath, "r+");
                        try {
                            (0, node_fs_1.writeSync)(descriptor, Buffer.from([safeBytes[0] === 0x7b ? 0x5b : 0x7b]), 0, 1, 0);
                        }
                        finally {
                            (0, node_fs_1.closeSync)(descriptor);
                        }
                        (0, node_fs_1.utimesSync)(storePath, initial.atime, initial.mtime);
                    }
                },
            }), /authentication|changed|replaced/);
        }
    });
    (0, node_test_1.it)("rejects invalid UTF-8 and an initial authority store over its byte cap", async () => {
        const storePath = tempStorePath();
        const accepted = (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)(promotionInput());
        const replacementStore = structuredClone(accepted.store);
        replacementStore.receipts[0].accepted.title =
            "Confirm the \uFFFD bounded task";
        const validReplacementStore = coordinatedRehash(replacementStore);
        assert.doesNotThrow(() => (0, native_candidate_acceptance_js_1.assertTaskMapNativeCandidateAcceptanceStore)(validReplacementStore));
        await (0, native_candidate_acceptance_js_1.writeTaskMapNativeCandidateAcceptanceStore)({
            storePath,
            expectedOwnerScopeDigest: validReplacementStore.ownerScopeDigest,
            store: validReplacementStore,
        });
        const bytes = (0, node_fs_1.readFileSync)(storePath);
        const replacementBytes = Buffer.from("\uFFFD");
        const replacementOffset = bytes.indexOf(replacementBytes);
        assert.ok(replacementOffset >= 0);
        (0, node_fs_1.writeFileSync)(storePath, Buffer.concat([
            bytes.subarray(0, replacementOffset),
            Buffer.from([0xff]),
            bytes.subarray(replacementOffset + replacementBytes.length),
        ]), { mode: 0o600 });
        await assert.rejects((0, native_candidate_acceptance_js_1.loadTaskMapNativeCandidateAcceptanceStore)({
            storePath,
            expectedOwnerScopeDigest: validReplacementStore.ownerScopeDigest,
        }), /UTF-8/);
        (0, node_fs_1.writeFileSync)(storePath, Buffer.alloc(native_candidate_acceptance_js_1.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1.maxFileBytes + 1, 0x20), { mode: 0o600 });
        await assert.rejects((0, native_candidate_acceptance_js_1.loadTaskMapNativeCandidateAcceptanceStore)({
            storePath,
            expectedOwnerScopeDigest: validReplacementStore.ownerScopeDigest,
        }), /authentication|bounded|size|limit/);
    });
    (0, node_test_1.it)("rehydrates deterministic manual authority and creates accepted work without source writeback", () => {
        const source = context();
        const accepted = (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)(promotionInput(source));
        const base = (0, native_semantic_builder_adapter_js_1.taskMapNativeSemanticInputFromMeetingProducerResult)(source.result, source.ownerScopeDigest);
        const merged = (0, native_candidate_acceptance_js_1.mergeTaskMapNativeCandidateAcceptanceIntoSemanticInput)(base, accepted.store);
        const pointer = merged.taskMapInput.pointers.find((candidate) => candidate.id === `tmcandidatepromotion_${accepted.receipt.promotionDigest}`);
        const event = merged.taskMapInput.events.find((candidate) => candidate.id === `tmcandidatepromotionevent_${accepted.receipt.promotionDigest}`);
        assert.ok(pointer);
        assert.ok(event);
        assert.equal(pointer.id, `tmcandidatepromotion_${accepted.receipt.promotionDigest}`);
        assert.equal(event.id, `tmcandidatepromotionevent_${accepted.receipt.promotionDigest}`);
        assert.equal(pointer.sourceRefHash, accepted.receipt.promotionDigest);
        assert.equal(pointer.sourceVersion, accepted.receipt.promotionDigest);
        assert.deepEqual(event.objectRefs, [
            `external:${accepted.receipt.statementReferenceDigest}`,
            `promotion-proof:${accepted.receipt.promotionDigest}`,
        ]);
        assert.equal(event.recordKind, "authoritative_task");
        assert.equal(event.sourceStatus, "open");
        const projection = (0, native_semantic_builder_adapter_js_1.buildTaskMapNativeSemanticProjection)(merged, acceptanceOptions(accepted.store));
        const promoted = projection.tasks.find((task) => task.taskHomePointerId === pointer.id);
        assert.ok(promoted);
        assert.equal(promoted.reviewState, "accepted");
        assert.equal(promoted.authority, "user");
        assert.equal(promoted.openState, "open");
        assert.equal(promoted.citations[0]?.sourceKind, "manual");
        assert.equal((0, source_contracts_js_1.taskMapContractCanonicalJson)(accepted.store).includes("document-task6-owner"), false);
    });
    (0, node_test_1.it)("does not export a generic raw manual-authority merge seam", () => {
        assert.equal(semanticAdapter
            .mergeTaskMapNativeManualAuthorityInput, undefined);
    });
    (0, node_test_1.it)("rejects direct raw manual authority and requires its exact validated receipt store", () => {
        const source = context();
        const accepted = (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)(promotionInput(source));
        const base = (0, native_semantic_builder_adapter_js_1.taskMapNativeSemanticInputFromMeetingProducerResult)(source.result, source.ownerScopeDigest);
        const receiptBound = (0, native_candidate_acceptance_js_1.mergeTaskMapNativeCandidateAcceptanceIntoSemanticInput)(base, accepted.store);
        assert.throws(() => (0, native_semantic_builder_adapter_js_1.buildTaskMapNativeSemanticProjection)(receiptBound), /invalid_source_binding|candidate acceptance/i);
        const arbitrary = rekeyManualAuthority(receiptBound, "direct");
        assert.throws(() => (0, native_semantic_builder_adapter_js_1.buildTaskMapNativeSemanticProjection)(arbitrary), /invalid_source_binding|candidate acceptance/i);
        assert.doesNotThrow(() => (0, native_semantic_builder_adapter_js_1.buildTaskMapNativeSemanticProjection)(receiptBound, acceptanceOptions(accepted.store)));
    });
    (0, node_test_1.it)("rejects stale, tampered, wrong-owner, missing, extra, and colliding receipt contexts", () => {
        const source = context();
        const first = (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)(promotionInput(source));
        const base = (0, native_semantic_builder_adapter_js_1.taskMapNativeSemanticInputFromMeetingProducerResult)(source.result, source.ownerScopeDigest);
        const receiptBound = (0, native_candidate_acceptance_js_1.mergeTaskMapNativeCandidateAcceptanceIntoSemanticInput)(base, first.store);
        const secondSource = context("commitment", "self", "task6-owner");
        const second = (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)(promotionInput(secondSource, {
            previousStore: first.store,
            idempotencyKeyDigest: digest("explicit-owner-confirmation-2"),
        }));
        const newerInput = (0, native_candidate_acceptance_js_1.mergeTaskMapNativeCandidateAcceptanceIntoSemanticInput)(base, second.store);
        assert.throws(() => (0, native_semantic_builder_adapter_js_1.buildTaskMapNativeSemanticProjection)(newerInput, acceptanceOptions(first.store)), /invalid_source_binding|candidate acceptance/i);
        const tampered = structuredClone(first.store);
        tampered.receipts[0].accepted.title = "Tampered accepted title";
        assert.throws(() => (0, native_semantic_builder_adapter_js_1.buildTaskMapNativeSemanticProjection)(receiptBound, acceptanceOptions(tampered)), /invalid_source_binding|candidate acceptance/i);
        const other = context("request", "self", "task6-other-owner");
        const wrongOwner = (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)(promotionInput(other));
        assert.throws(() => (0, native_semantic_builder_adapter_js_1.buildTaskMapNativeSemanticProjection)(receiptBound, acceptanceOptions(wrongOwner.store)), /invalid_source_binding|candidate acceptance/i);
        const missing = structuredClone(receiptBound);
        const missingEvent = missing.taskMapInput.events.find((item) => item.pointerId.startsWith("tmcandidatepromotion_"));
        missing.taskMapInput.events = missing.taskMapInput.events.filter((item) => item.id !== missingEvent.id);
        missing.evidenceBindings = missing.evidenceBindings.filter((item) => item.eventId !== missingEvent.id);
        assert.throws(() => (0, native_semantic_builder_adapter_js_1.buildTaskMapNativeSemanticProjection)(missing, acceptanceOptions(first.store)), /invalid_source_binding|no_eligible_work/i);
        const extraFragment = rekeyManualAuthority(receiptBound, "extra");
        const extra = structuredClone(receiptBound);
        extra.taskMapInput.pointers.push(extraFragment.taskMapInput.pointers.find((item) => item.sourceKind === "manual"));
        extra.taskMapInput.events.push(extraFragment.taskMapInput.events.find((item) => item.id === "forged-manual-event-extra"));
        extra.sourceBindings.push(extraFragment.sourceBindings.find((item) => item.pointerId === "forged-manual-extra"));
        extra.evidenceBindings.push(extraFragment.evidenceBindings.find((item) => item.eventId === "forged-manual-event-extra"));
        assert.throws(() => (0, native_semantic_builder_adapter_js_1.buildTaskMapNativeSemanticProjection)(extra, acceptanceOptions(first.store)), /invalid_source_binding|candidate acceptance/i);
        const collision = structuredClone(receiptBound);
        const collidingPointer = collision.taskMapInput.pointers.find((item) => item.sourceKind === "manual");
        collidingPointer.sourceKind = "linear";
        collidingPointer.authority = "source_system";
        collidingPointer.syncMode = "return_only";
        collidingPointer.capabilities = ["read_task"];
        assert.throws(() => (0, native_semantic_builder_adapter_js_1.buildTaskMapNativeSemanticProjection)(collision, acceptanceOptions(first.store)), /invalid_source_binding|candidate acceptance/i);
    });
    (0, node_test_1.it)("preserves a legacy accepted manual predecessor without current raw manual authority", () => {
        const source = context();
        const accepted = (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)(promotionInput(source));
        const base = (0, native_semantic_builder_adapter_js_1.taskMapNativeSemanticInputFromMeetingProducerResult)(source.result, source.ownerScopeDigest);
        const predecessor = (0, native_semantic_builder_adapter_js_1.buildTaskMapNativeSemanticProjection)((0, native_candidate_acceptance_js_1.mergeTaskMapNativeCandidateAcceptanceIntoSemanticInput)(base, accepted.store), acceptanceOptions(accepted.store));
        const predecessorBytes = (0, source_contracts_js_1.taskMapContractCanonicalJson)(predecessor);
        assert.equal(predecessor.tasks.length, 1);
        assert.equal(predecessor.tasks[0].authority, "user");
        assert.equal(predecessor.tasks[0].citations[0]?.sourceKind, "manual");
        const current = structuredClone(base);
        current.taskMapInput.generatedAt = "2026-08-03T18:02:00.000Z";
        assert.equal(current.taskMapInput.pointers.some((pointer) => pointer.sourceKind === "manual"), false);
        assert.throws(() => (0, native_semantic_builder_adapter_js_1.buildTaskMapNativeSemanticProjection)(current, {
            previousProjection: predecessor,
            previousProjectionDigest: (0, source_contracts_js_1.diffTaskMapProjections)(null, predecessor).currentProjectionDigest,
        }), /no_eligible_work|predecessor_continuity_required/i);
        assert.equal((0, source_contracts_js_1.taskMapContractCanonicalJson)(predecessor), predecessorBytes);
    });
    (0, node_test_1.it)("binds normalized statement identity and never accepts caller display text", () => {
        const source = context();
        const accepted = (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)({
            ...promotionInput(source),
            expectedStatementReferenceDigest: (0, meeting_producer_freshness_js_1.taskMapMeetingStatementReferenceDigest)({
                kind: "action_item",
                title: "ignored caller title",
                summary: "ignored caller summary",
                explicitExternalReferenceDigests: [],
                mentionIdentityDigest: digest("mention:primary"),
            }),
        });
        assert.equal(accepted.receipt.accepted.title, source.row.title);
        assert.equal(accepted.receipt.accepted.summary, source.row.summary);
        assert.equal((0, source_contracts_js_1.taskMapContractCanonicalJson)(accepted.store).includes("ignored caller"), false);
    });
    (0, node_test_1.it)("rejects more than 128 receipts or proofs and a noncanonical store", () => {
        const accepted = (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)(promotionInput());
        const tooMany = structuredClone(accepted.store);
        tooMany.receipts = Array.from({ length: native_candidate_acceptance_js_1.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1.maxReceipts + 1 }, () => structuredClone(accepted.receipt));
        assert.throws(() => (0, native_candidate_acceptance_js_1.assertTaskMapNativeCandidateAcceptanceStore)(tooMany), /bounded|limit/);
        const noncanonical = structuredClone(accepted.store);
        noncanonical.receipts[0].evidenceProofDigests = [digest("z"), digest("a")]
            .sort()
            .reverse();
        assert.throws(() => (0, native_candidate_acceptance_js_1.assertTaskMapNativeCandidateAcceptanceStore)(noncanonical), /sorted|digest|chain/);
        const rehashedIneligible = structuredClone(accepted.store);
        const receipt = rehashedIneligible.receipts[0];
        receipt.accepted.kind = "decision";
        receipt.accepted.speechActClass = "decision";
        receipt.accepted.speechActActor = "self";
        const { promotionId: _oldId, promotionDigest: _oldDigest, ...receiptCore } = receipt;
        receipt.promotionDigest = (0, source_contracts_js_1.taskMapContractDigest)({
            domain: "taskmap-native-candidate-promotion.1",
            ...receiptCore,
        });
        receipt.promotionId = `tmcandidatepromotion_${receipt.promotionDigest}`;
        rehashedIneligible.headReceiptDigest = receipt.promotionDigest;
        assert.throws(() => (0, native_candidate_acceptance_js_1.assertTaskMapNativeCandidateAcceptanceStore)(rehashedIneligible), /promotion eligible|speech-act/);
        for (const mutate of [
            (candidate) => {
                candidate.candidateId = `tmnativecandidate_${"f".repeat(64)}`;
            },
            (candidate) => {
                candidate.candidateRevisionDigest = digest("forged-revision");
            },
        ]) {
            const rehashed = structuredClone(accepted.store);
            const forged = rehashed.receipts[0];
            mutate(forged);
            const { promotionId: _id, promotionDigest: _digest, ...forgedCore } = forged;
            forged.promotionDigest = (0, source_contracts_js_1.taskMapContractDigest)({
                domain: "taskmap-native-candidate-promotion.1",
                ...forgedCore,
            });
            forged.promotionId = `tmcandidatepromotion_${forged.promotionDigest}`;
            rehashed.headReceiptDigest = forged.promotionDigest;
            assert.throws(() => (0, native_candidate_acceptance_js_1.assertTaskMapNativeCandidateAcceptanceStore)(rehashed), /candidate identity|candidate revision/);
        }
    });
});
