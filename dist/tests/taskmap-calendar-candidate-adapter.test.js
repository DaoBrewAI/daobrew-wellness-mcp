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
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const agent_session_candidate_adapter_js_1 = require("../src/engine/taskmap/agent-session-candidate-adapter.js");
const agent_session_producer_freshness_js_1 = require("../src/engine/taskmap/agent-session-producer-freshness.js");
const agent_session_semantic_admission_js_1 = require("../src/engine/taskmap/agent-session-semantic-admission.js");
const calendar_candidate_adapter_js_1 = require("../src/engine/taskmap/calendar-candidate-adapter.js");
const calendar_refresh_llm_replay_js_1 = require("../src/engine/taskmap/calendar-refresh-llm-replay.js");
const meeting_producer_freshness_js_1 = require("../src/engine/taskmap/meeting-producer-freshness.js");
const native_candidate_review_js_1 = require("../src/engine/taskmap/native-candidate-review.js");
const native_semantic_builder_adapter_js_1 = require("../src/engine/taskmap/native-semantic-builder-adapter.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const OWNER = (0, source_contracts_js_1.taskMapContractDigest)("candidate-adapter-owner");
const PRODUCED_AT = "2026-08-07T20:00:00.000Z";
const ASSESSED_AT = "2026-08-07T20:30:00.000Z";
function observation() {
    const rows = [
        {
            timestamp: "2026-08-07T19:50:00.000Z",
            type: "session_meta",
            payload: { id: "candidate-adapter-session" },
        },
        {
            timestamp: "2026-08-07T19:51:00.000Z",
            type: "turn_context",
            payload: {
                cwd: "/Users/reviewer/DaobrewAI",
                workspace_roots: ["/Users/reviewer/DaobrewAI"],
            },
        },
        {
            timestamp: "2026-08-07T19:52:00.000Z",
            type: "response_item",
            payload: {
                id: "candidate-adapter-turn",
                type: "message",
                role: "user",
                content: [{ type: "input_text", text: "Implement candidate adapters" }],
            },
        },
        {
            timestamp: "2026-08-07T19:53:00.000Z",
            type: "response_item",
            payload: {
                type: "message",
                role: "assistant",
                content: [{ type: "output_text", text: "Prepared candidate adapters." }],
            },
        },
    ];
    return {
        provider: "codex",
        rawJsonl: `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
    };
}
function agentFixture(degraded = false) {
    const admission = (0, agent_session_semantic_admission_js_1.buildTaskMapAgentSessionSemanticAdmission)((0, agent_session_producer_freshness_js_1.buildTaskMapAgentSessionProducerSnapshot)({
        ownerScopeDigest: OWNER,
        producedAt: PRODUCED_AT,
        observations: [observation()],
    }));
    const cluster = admission.clusters[0];
    const classes = ["request", "commitment", "decision", "other"];
    const actors = ["self", "other"];
    const mentions = classes.flatMap((speechActClass) => actors.map((speechActActor) => {
        const gate = (0, meeting_producer_freshness_js_1.taskMapMeetingObligationGate)(speechActClass, speechActActor);
        return {
            text: `${speechActClass} ${speechActActor} evidence`,
            title: `${speechActClass} ${speechActActor} title`,
            speechActClass,
            speechActActor,
            confidence: speechActActor === "self" ? 0.9 : 0.8,
            mentionIdentityDigest: (0, source_contracts_js_1.taskMapContractDigest)(`agent-${speechActClass}-${speechActActor}`),
            proposalDisposition: gate.proposalDisposition,
            promotionEligible: gate.promotionEligible,
        };
    }));
    const reportBase = {
        contractVersion: "taskmap-agent-session-extraction-report.v1",
        ownerScopeDigest: OWNER,
        admissionDigest: admission.admissionDigest,
        promptTemplateDigest: (0, source_contracts_js_1.taskMapContractDigest)("agent-prompt"),
        assessedAt: ASSESSED_AT,
        clusters: [{
                clusterIdentityDigest: cluster.clusterIdentityDigest,
                workstreamIdentityDigest: cluster.workstreamIdentityDigest,
                inputDigest: (0, source_contracts_js_1.taskMapContractDigest)("agent-input"),
                status: degraded ? "degraded" : "extracted",
                degradationCode: degraded ? "no_provider" : null,
                envelopeDigest: degraded ? null : (0, source_contracts_js_1.taskMapContractDigest)("agent-envelope"),
                envelopeModel: degraded ? null : "test-model",
                envelopeTransport: degraded ? null : "claude-cli",
                mentions: degraded ? [] : mentions,
            }],
        pendingCount: degraded ? 1 : 0,
    };
    const extraction = {
        ...reportBase,
        reportDigest: (0, source_contracts_js_1.taskMapContractDigest)(reportBase),
    };
    return { admission, extraction };
}
function calendarEvent(index) {
    const startAt = new Date(Date.parse("2026-08-06T18:00:00.000Z") + index * 86_400_000).toISOString();
    return {
        provider: "local_calendar",
        eventIdentityDigest: (0, source_contracts_js_1.taskMapContractDigest)(`calendar-event-${index}`),
        crossProviderIdentityDigest: null,
        revisionDigest: (0, source_contracts_js_1.taskMapContractDigest)(`calendar-revision-${index}`),
        title: `Review launch ${index}`,
        startAt,
        endAt: new Date(Date.parse(startAt) + 1_800_000).toISOString(),
    };
}
function calendarFixture() {
    const events = [calendarEvent(0), calendarEvent(1)];
    const result = {
        contractVersion: "taskmap-calendar-producer-result.v1",
        resultDigest: (0, source_contracts_js_1.taskMapContractDigest)("calendar-result"),
        ownerScopeDigest: OWNER,
        availability: "available",
        assessedAt: ASSESSED_AT,
        providers: [],
        events,
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
    const mentionIdentityDigest = (0, source_contracts_js_1.taskMapContractDigest)("shared-calendar-mention");
    const segments = events.map((event, index) => ({
        segmentIndex: index,
        inputDigest: (0, source_contracts_js_1.taskMapContractDigest)(`calendar-input-${index}`),
        eventIdentityDigests: [event.eventIdentityDigest],
        status: "extracted",
        degradationCode: null,
        envelopeDigest: (0, source_contracts_js_1.taskMapContractDigest)(`calendar-envelope-${index}`),
        envelopeModel: "test-model",
        envelopeTransport: "claude-cli",
        mentions: [{
                text: "Review launch",
                title: index === 0 ? "Review launch" : "Review launch now",
                speechActClass: "other",
                speechActActor: "unknown",
                confidence: index === 0 ? 0.7 : 0.9,
                mentionIdentityDigest,
                proposalDisposition: "candidate_only",
                promotionEligible: false,
            }],
    }));
    const reportBase = {
        contractVersion: "taskmap-calendar-extraction-report.v1",
        ownerScopeDigest: OWNER,
        resultDigest: result.resultDigest,
        promptTemplateDigest: (0, source_contracts_js_1.taskMapContractDigest)("calendar-prompt"),
        assessedAt: ASSESSED_AT,
        segments,
        pendingCount: 0,
    };
    const extraction = {
        ...reportBase,
        reportDigest: (0, source_contracts_js_1.taskMapContractDigest)(reportBase),
    };
    return { result, extraction };
}
(0, node_test_1.describe)("Task Map Station-1 candidate adapters", () => {
    (0, node_test_1.it)("builds mention-level agent rows from the shared four-class gate", () => {
        const source = agentFixture();
        const projection = (0, agent_session_candidate_adapter_js_1.buildTaskMapAgentSessionCandidateReview)({
            ...source,
            previous: null,
            expectedOwnerScopeDigest: OWNER,
            assessedAt: ASSESSED_AT,
        });
        assert.equal(projection.shelf.candidates.length, 8);
        for (const row of projection.shelf.candidates) {
            assert.equal(row.candidateFamily, "agent_session");
            if (row.candidateFamily !== "agent_session")
                continue;
            const gate = (0, meeting_producer_freshness_js_1.taskMapMeetingObligationGate)(row.speechActClass, row.speechActActor);
            assert.equal(row.promotionEligible, gate.promotionEligible);
            assert.equal(row.proposalDisposition, gate.proposalDisposition);
            assert.equal(row.kind, row.speechActClass === "commitment" ? "commitment"
                : row.speechActClass === "decision" ? "decision"
                    : "action_item");
        }
    });
    (0, node_test_1.it)("emits zero agent rows for degraded extraction clusters", () => {
        const source = agentFixture(true);
        const projection = (0, agent_session_candidate_adapter_js_1.buildTaskMapAgentSessionCandidateReview)({
            ...source,
            previous: null,
            expectedOwnerScopeDigest: OWNER,
            assessedAt: ASSESSED_AT,
        });
        assert.deepEqual(projection.shelf.candidates, []);
    });
    (0, node_test_1.it)("deduplicates calendar mentions across segments with calendar provenance", () => {
        const source = calendarFixture();
        const projection = (0, calendar_candidate_adapter_js_1.buildTaskMapCalendarCandidateReview)({
            ...source,
            previous: null,
            expectedOwnerScopeDigest: OWNER,
            assessedAt: ASSESSED_AT,
        });
        assert.equal(projection.shelf.candidates.length, 1);
        const row = projection.shelf.candidates[0];
        assert.equal(row.candidateFamily, "calendar");
        assert.deepEqual(row.sourceKinds, ["calendar"]);
        assert.equal(row.confidence, 0.9);
        assert.equal(row.occurredAt, source.result.events[0]?.startAt);
        assert.equal(row.promotionEligible, false);
        (0, native_candidate_review_js_1.assertTaskMapNativeCandidateShelfV2)(projection.shelf);
        const forged = structuredClone(projection.shelf);
        forged.candidates[0].sourceKinds = ["google_calendar"];
        assert.throws(() => (0, native_candidate_review_js_1.assertTaskMapNativeCandidateShelfV2)(forged), /calendar|source/i);
    });
    (0, node_test_1.it)("accepts conservative AND-folded eligibility but rejects gate overclaims", () => {
        const calendar = calendarFixture();
        calendar.extraction.segments[0].mentions[0] = {
            ...calendar.extraction.segments[0].mentions[0],
            speechActClass: "request",
            speechActActor: "other",
            confidence: 0.7,
            proposalDisposition: "candidate_only",
            promotionEligible: false,
        };
        calendar.extraction.segments[1].mentions[0] = {
            ...calendar.extraction.segments[1].mentions[0],
            speechActClass: "request",
            speechActActor: "self",
            confidence: 0.9,
            proposalDisposition: "candidate_only",
            promotionEligible: true,
        };
        const calendarReview = (0, calendar_candidate_adapter_js_1.buildTaskMapCalendarCandidateReview)({
            ...calendar,
            previous: null,
            expectedOwnerScopeDigest: OWNER,
            assessedAt: ASSESSED_AT,
        });
        assert.equal(calendarReview.shelf.candidates.length, 1);
        assert.equal(calendarReview.shelf.candidates[0]?.speechActActor, "self");
        assert.equal(calendarReview.shelf.candidates[0]?.promotionEligible, false);
        (0, native_candidate_review_js_1.assertTaskMapNativeCandidateShelfV2)(calendarReview.shelf);
        const agent = agentFixture();
        const agentReview = (0, agent_session_candidate_adapter_js_1.buildTaskMapAgentSessionCandidateReview)({
            ...agent,
            previous: null,
            expectedOwnerScopeDigest: OWNER,
            assessedAt: ASSESSED_AT,
        });
        const underclaimed = structuredClone(agentReview.shelf);
        const promotableAgent = underclaimed.candidates.find((candidate) => candidate.candidateFamily === "agent_session"
            && candidate.speechActClass === "request"
            && candidate.speechActActor === "self");
        promotableAgent.promotionEligible = false;
        (0, native_candidate_review_js_1.assertTaskMapNativeCandidateShelfV2)(underclaimed);
        const overclaimed = structuredClone(calendarReview.shelf);
        const calendarRow = overclaimed.candidates[0];
        if (calendarRow.candidateFamily !== "calendar") {
            throw new Error("expected calendar fixture row");
        }
        calendarRow.speechActClass = "other";
        calendarRow.speechActActor = "unknown";
        calendarRow.promotionEligible = true;
        assert.throws(() => (0, native_candidate_review_js_1.assertTaskMapNativeCandidateShelfV2)(overclaimed), /calendar|source|proof/i);
    });
    (0, node_test_1.it)("bounds a future calendar occurrence at the assessment instant", () => {
        const source = calendarFixture();
        const future = structuredClone(source);
        for (const [index, event] of future.result.events.entries()) {
            event.startAt = new Date(Date.parse("2026-08-08T20:00:00.000Z") + index * 3_600_000).toISOString();
            event.endAt = new Date(Date.parse(event.startAt) + 1_800_000).toISOString();
        }
        const projection = (0, calendar_candidate_adapter_js_1.buildTaskMapCalendarCandidateReview)({
            ...future,
            previous: null,
            expectedOwnerScopeDigest: OWNER,
            assessedAt: ASSESSED_AT,
        });
        assert.equal(projection.shelf.candidates[0].occurredAt, ASSESSED_AT);
    });
    (0, node_test_1.it)("builds reference-only calendar semantic evidence with provider provenance", () => {
        const source = calendarFixture();
        const fragment = (0, calendar_refresh_llm_replay_js_1.buildTaskMapCalendarSemanticFragment)(source.result, source.extraction);
        assert.deepEqual(fragment.taskMapInput.pointers.map((pointer) => ({
            sourceKind: pointer.sourceKind,
            authority: pointer.authority,
            syncMode: pointer.syncMode,
        })), [
            {
                sourceKind: "local_calendar",
                authority: "none",
                syncMode: "reference_only",
            },
            {
                sourceKind: "local_calendar",
                authority: "none",
                syncMode: "reference_only",
            },
        ]);
        assert.equal(fragment.taskMapInput.events.length, 2);
        const candidateRefs = fragment.evidenceBindings.map((binding) => binding.candidateIdentityRef);
        assert.equal(new Set(candidateRefs).size, 1);
        assert.match(candidateRefs[0] ?? "", /^external:[a-f0-9]{64}$/);
        assert.ok(fragment.evidenceBindings.every((binding) => binding.disposition === "candidate_only"));
        const projection = (0, native_semantic_builder_adapter_js_1.buildTaskMapNativeSemanticProjection)({
            contractVersion: "taskmap-native-semantic-builder-input.v1",
            ownerScopeDigest: OWNER,
            producer: {
                id: "taskmap-meeting-producer-result.v1",
                version: "taskmap-meeting-producer.1",
            },
            freshness: {
                decision: "fresh",
                available: true,
                retainedLastGood: false,
                producedAt: ASSESSED_AT,
                validThrough: "2026-08-08T00:30:00.000Z",
                assessedAt: ASSESSED_AT,
            },
            sourceBindings: fragment.sourceBindings,
            evidenceBindings: fragment.evidenceBindings,
            taskMapInput: fragment.taskMapInput,
        });
        assert.equal(projection.tasks.length, 1);
    });
});
