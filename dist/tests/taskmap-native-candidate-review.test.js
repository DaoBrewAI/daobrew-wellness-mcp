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
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const meeting_producer_freshness_js_1 = require("../src/engine/taskmap/meeting-producer-freshness.js");
const confirmed_owner_js_1 = require("./support/confirmed-owner.js");
const native_candidate_review_js_1 = require("../src/engine/taskmap/native-candidate-review.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const agent_session_producer_freshness_js_1 = require("../src/engine/taskmap/agent-session-producer-freshness.js");
const agent_session_semantic_admission_js_1 = require("../src/engine/taskmap/agent-session-semantic-admission.js");
const agent_session_candidate_adapter_js_1 = require("../src/engine/taskmap/agent-session-candidate-adapter.js");
const taskmap_agent_session_extraction_fixture_js_1 = require("./taskmap-agent-session-extraction-fixture.js");
const PRODUCED_AT = "2026-07-29T12:00:00.000Z";
const ASSESSED_AT = "2026-07-29T13:00:00.000Z";
const VALID_THROUGH = "2026-07-29T16:00:00.000Z";
const ACTION_TITLE = "PRIVATE_TITLE_SENTINEL";
const ACTION_SUMMARY = "PRIVATE_SUMMARY_SENTINEL";
const tempRoots = [];
(0, node_test_1.afterEach)(() => {
    for (const root of tempRoots.splice(0)) {
        (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
    }
});
function digest(value) {
    return (0, node_crypto_1.createHash)("sha256").update(value).digest("hex");
}
function binding() {
    return {
        connectionId: "gemini-owner",
        sourceKind: "gemini_meet",
        tenantOrWorkspaceDigest: digest("workspace"),
        accountOrPrincipalDigest: digest("principal"),
        grantVersion: "grant-1",
    };
}
function action(overrides = {}) {
    return {
        kind: "action_item",
        title: ACTION_TITLE,
        summary: ACTION_SUMMARY,
        occurredAt: "2026-07-29T09:00:00.000Z",
        observedAt: "2026-07-29T11:00:00.000Z",
        status: "open",
        deadline: "2026-07-30T17:00:00.000Z",
        quality: "structured_generated",
        coverage: "partial",
        confidence: 0.8,
        objectRefs: [{
                kind: "external_reference",
                referenceDigest: digest("PRIVATE_URL_REFERENCE_SENTINEL"),
            }],
        ...overrides,
    };
}
function decision() {
    return {
        kind: "decision",
        title: "PRIVATE_DECISION_TITLE_SENTINEL",
        summary: "PRIVATE_DECISION_SUMMARY_SENTINEL",
        occurredAt: "2026-07-29T09:00:00.000Z",
        observedAt: "2026-07-29T11:00:00.000Z",
        quality: "structured_generated",
        coverage: "complete",
        confidence: 0.9,
    };
}
function commitment() {
    return {
        ...action({
            title: "PRIVATE_COMMITMENT_TITLE_SENTINEL",
            summary: "PRIVATE_COMMITMENT_SUMMARY_SENTINEL",
            status: "in_progress",
        }),
        kind: "commitment",
    };
}
function speechAct(speechActClass, speechActActor, index, overrides = {}) {
    return {
        ...action({
            kind: speechActClass === "commitment"
                ? "commitment"
                : speechActClass === "decision"
                    ? "decision"
                    : "action_item",
            title: `PRIVATE_${speechActClass.toUpperCase()}_TITLE_${index}`,
            summary: `Verbatim ${speechActClass} ${speechActActor} ${index}.`,
            status: speechActClass === "decision" ? undefined : "open",
            deadline: undefined,
            objectRefs: undefined,
            speechActClass,
            speechActActor,
            mentionIdentityDigest: digest(`mention-${index}`),
            extractionEnvelopeDigest: digest(`envelope-${index}`),
            confidence: (index + 1) / 20,
        }),
        ...overrides,
    };
}
function producerResult(input = {}) {
    const revision = input.revision ?? "PRIVATE_REVISION_SENTINEL_1";
    const evidence = input.evidence ?? [
        action(input.actionOverrides),
        ...(input.includeDecision === false ? [] : [decision()]),
        ...(input.includeCommitment === true ? [commitment()] : []),
    ];
    const snapshot = (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)({
        ownerScopeDigest: (0, confirmed_owner_js_1.testOwnerScopeDigest)(input.owner ?? "owner-a"),
        producedAt: PRODUCED_AT,
        meetings: [{
                binding: binding(),
                documentId: "PRIVATE_DOCUMENT_ID_SENTINEL",
                revisionId: revision,
                contentDigest: digest(`content:${revision}`),
                modifiedAt: "2026-07-29T10:00:00.000Z",
                eventTime: "2026-07-29T09:00:00.000Z",
                observedAt: "2026-07-29T11:00:00.000Z",
                evidence,
            }],
    });
    return (0, meeting_producer_freshness_js_1.assessTaskMapMeetingProducerSnapshot)(snapshot, input.assessedAt ?? ASSESSED_AT);
}
function build(result = producerResult(), previous = null) {
    const ownerScopeDigest = result.snapshot?.ownerScopeDigest
        ?? (0, confirmed_owner_js_1.testOwnerScopeDigest)("owner-a");
    return (0, native_candidate_review_js_1.buildTaskMapNativeCandidateReview)({
        result,
        previous,
        expectedOwnerScopeDigest: ownerScopeDigest,
        assessedAt: ASSESSED_AT,
    });
}
function tempOverlayPath() {
    const root = (0, node_fs_1.mkdtempSync)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-native-candidate-review-"));
    (0, node_fs_1.chmodSync)(root, 0o700);
    tempRoots.push(root);
    return node_path_1.default.join((0, node_fs_1.realpathSync)(root), "native-candidate-review.v1.json");
}
(0, node_test_1.describe)("M2C native candidate review", () => {
    (0, node_test_1.it)("publishes all four speech-act classes with exact proof and review-only fields", () => {
        const drafts = [
            speechAct("request", "self", 1),
            speechAct("commitment", "other", 2),
            speechAct("decision", "unknown", 3),
            speechAct("other", "self", 4),
        ];
        const result = producerResult({ evidence: drafts });
        const overlay = build(result);
        const shelf = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateShelf)(result, overlay, ASSESSED_AT);
        assert.equal(shelf.candidates.length, 4);
        assert.deepEqual(shelf.candidates.map((row) => row.speechActClass).sort(), ["commitment", "decision", "other", "request"]);
        for (const row of shelf.candidates) {
            const persisted = overlay.candidates.find((candidate) => candidate.candidateId === row.candidateId);
            assert.ok(persisted);
            assert.equal(row.statementReferenceDigest, persisted.statementReferenceDigest);
            assert.deepEqual(row.evidenceProofDigests, persisted.evidenceProofDigests);
            assert.deepEqual(row.evidenceProofDigests, [...row.evidenceProofDigests].sort());
            assert.match(row.mentionIdentityDigest ?? "", /^[a-f0-9]{64}$/);
            assert.equal(row.reviewState, "unreviewed");
            assert.equal(row.reviewedOnly, false);
            assert.equal(row.acceptedWork, false);
            assert.equal(row.rankEligible, false);
            assert.equal(row.routeEligible, false);
            assert.equal(row.proveEligible, false);
            assert.equal(row.runEligible, false);
        }
        const byClass = new Map(shelf.candidates.map((row) => [row.speechActClass, row]));
        assert.equal(byClass.get("request")?.confidence, 0.1);
        assert.equal(byClass.get("request")?.speechActActor, "self");
        assert.equal(byClass.get("request")?.promotionEligible, true);
        assert.equal(byClass.get("commitment")?.confidence, 0.15);
        assert.equal(byClass.get("commitment")?.promotionEligible, false);
        assert.equal(byClass.get("decision")?.confidence, 0.2);
        assert.equal(byClass.get("decision")?.promotionEligible, false);
        assert.equal(byClass.get("other")?.confidence, 0.25);
        assert.equal(byClass.get("other")?.promotionEligible, false);
    });
    (0, node_test_1.it)("keeps normalized candidate identity stable while provenance proof rotates", () => {
        const firstResult = producerResult({
            evidence: [speechAct("request", "self", 5)],
        });
        const first = build(firstResult);
        const rotatedResult = producerResult({
            revision: "PRIVATE_REVISION_SENTINEL_2",
            evidence: [speechAct("request", "self", 5, {
                    extractionEnvelopeDigest: digest("rotated-envelope"),
                    confidence: 0.91,
                })],
        });
        const rotated = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateReview)({
            result: rotatedResult,
            previous: first,
            expectedOwnerScopeDigest: first.ownerScopeDigest,
            assessedAt: ASSESSED_AT,
        });
        assert.equal(rotated.candidates[0].candidateId, first.candidates[0].candidateId);
        assert.equal(rotated.candidates[0].statementReferenceDigest, first.candidates[0].statementReferenceDigest);
        assert.notDeepEqual(rotated.candidates[0].evidenceProofDigests, first.candidates[0].evidenceProofDigests);
        assert.notEqual(rotated.candidates[0].candidateRevisionDigest, first.candidates[0].candidateRevisionDigest);
    });
    (0, node_test_1.it)("binds disposition and complete speech-act provenance into exact evidence proofs", () => {
        const result = producerResult({
            evidence: [speechAct("request", "self", 10)],
        });
        const overlay = build(result);
        const meeting = result.snapshot?.meetings[0];
        const evidence = meeting?.evidence[0];
        assert.ok(meeting);
        assert.ok(evidence);
        const expectedProof = (0, source_contracts_js_1.taskMapContractDigest)({
            domain: "taskmap-native-candidate-evidence-proof.1",
            statementReferenceDigest: evidence.statementReferenceDigest,
            evidenceDigest: evidence.evidenceDigest,
            canonicalMeetingDigest: (0, source_contracts_js_1.taskMapContractDigest)(evidence.canonicalMeetingId),
            kind: evidence.kind,
            occurredAt: evidence.occurredAt,
            observedAt: evidence.observedAt,
            authority: evidence.authority,
            proposalDisposition: evidence.proposalDisposition,
            quality: evidence.quality,
            coverage: evidence.coverage,
            confidence: evidence.confidence,
            status: evidence.status,
            deadline: evidence.deadline,
            objectRefDigests: evidence.objectRefs.map((ref) => (0, source_contracts_js_1.taskMapContractDigest)(ref)).sort(),
            supportingSourceVariantRefDigests: [...evidence.supportingSourceVariantRefDigests].sort(),
            sourceKinds: ["gemini_meet"],
            speechActClass: evidence.speechActClass,
            speechActActor: evidence.speechActActor,
            mentionIdentityDigest: evidence.mentionIdentityDigest,
            extractionEnvelopeDigest: evidence.extractionEnvelopeDigest,
            promotionEligible: evidence.promotionEligible,
        });
        assert.deepEqual(overlay.candidates[0].evidenceProofDigests, [expectedProof]);
    });
    (0, node_test_1.it)("groups duplicate mentions by statement proof and fails promotion closed", () => {
        const mentionIdentityDigest = digest("shared-normalized-mention");
        const result = producerResult({
            evidence: [
                speechAct("request", "self", 6, {
                    mentionIdentityDigest,
                    occurredAt: "2026-07-29T08:00:00.000Z",
                    confidence: 0.92,
                }),
                speechAct("request", "other", 7, {
                    mentionIdentityDigest,
                    occurredAt: "2026-07-29T09:00:00.000Z",
                    confidence: 0.44,
                }),
            ],
        });
        const overlay = build(result);
        const shelf = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateShelf)(result, overlay, ASSESSED_AT);
        assert.equal(shelf.candidates.length, 1);
        assert.equal(shelf.candidates[0].speechActActor, "self");
        assert.equal(shelf.candidates[0].confidence, 0.92);
        assert.equal(shelf.candidates[0].promotionEligible, false);
        assert.equal(shelf.candidates[0].evidenceProofDigests.length, 2);
        const unanimousResult = producerResult({
            evidence: [speechAct("request", "self", 6, {
                    mentionIdentityDigest,
                    occurredAt: "2026-07-29T08:00:00.000Z",
                    confidence: 0.92,
                })],
        });
        const unanimous = build(unanimousResult);
        assert.equal(unanimous.candidates[0].candidateId, overlay.candidates[0].candidateId);
        assert.notEqual(unanimous.candidates[0].candidateRevisionDigest, overlay.candidates[0].candidateRevisionDigest);
    });
    (0, node_test_1.it)("omits current dismissals but resurfaces stale dismissals after proof rotation", () => {
        const result = producerResult({
            evidence: [speechAct("request", "self", 8)],
        });
        const overlay = build(result);
        const dismissed = (0, native_candidate_review_js_1.reduceTaskMapNativeCandidateReview)({
            result,
            overlay,
            expectedOwnerScopeDigest: overlay.ownerScopeDigest,
            assessedAt: ASSESSED_AT,
            candidateId: overlay.candidates[0].candidateId,
            expectedCandidateRevisionDigest: overlay.candidates[0].candidateRevisionDigest,
            action: "dismiss",
            idempotencyKeyDigest: digest("dismiss-current"),
            decidedAt: ASSESSED_AT,
        });
        assert.equal((0, native_candidate_review_js_1.buildTaskMapNativeCandidateShelf)(result, dismissed, ASSESSED_AT)
            .candidates.length, 0);
        const rotatedResult = producerResult({
            revision: "PRIVATE_REVISION_SENTINEL_2",
            evidence: [speechAct("request", "self", 8, { confidence: 0.99 })],
        });
        const rotated = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateReview)({
            result: rotatedResult,
            previous: dismissed,
            expectedOwnerScopeDigest: dismissed.ownerScopeDigest,
            assessedAt: ASSESSED_AT,
        });
        const resurfaced = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateShelf)(rotatedResult, rotated, ASSESSED_AT);
        assert.equal(resurfaced.candidates.length, 1);
        assert.equal(resurfaced.candidates[0].reviewState, "unreviewed");
        assert.equal(resurfaced.candidates[0].reviewedOnly, false);
    });
    (0, node_test_1.it)("keeps accept-for-review and defer visible without accepted authority", () => {
        for (const action of ["accept_for_review", "defer"]) {
            const result = producerResult({
                evidence: [speechAct("commitment", "self", 9)],
            });
            const overlay = build(result);
            const reviewed = (0, native_candidate_review_js_1.reduceTaskMapNativeCandidateReview)({
                result,
                overlay,
                expectedOwnerScopeDigest: overlay.ownerScopeDigest,
                assessedAt: ASSESSED_AT,
                candidateId: overlay.candidates[0].candidateId,
                expectedCandidateRevisionDigest: overlay.candidates[0].candidateRevisionDigest,
                action,
                idempotencyKeyDigest: digest(`visible-${action}`),
                decidedAt: ASSESSED_AT,
            });
            const row = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateShelf)(result, reviewed, ASSESSED_AT).candidates[0];
            assert.equal(row.reviewState, action);
            assert.equal(row.reviewedOnly, true);
            assert.equal(row.acceptedWork, false);
            assert.equal(row.rankEligible, false);
            assert.equal(row.routeEligible, false);
            assert.equal(row.proveEligible, false);
            assert.equal(row.runEligible, false);
        }
    });
    (0, node_test_1.it)("keeps legacy candidates visible but never promotion eligible", () => {
        const result = producerResult({ includeDecision: false });
        const overlay = build(result);
        const row = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateShelf)(result, overlay, ASSESSED_AT).candidates[0];
        assert.equal(Object.hasOwn(row, "speechActClass"), false);
        assert.equal(Object.hasOwn(row, "speechActActor"), false);
        assert.equal(Object.hasOwn(row, "mentionIdentityDigest"), false);
        assert.equal(row.promotionEligible, false);
        assert.equal(row.confidence, 0.8);
    });
    (0, node_test_1.it)("preserves the anchored legacy proof and revision bytes", () => {
        const overlay = build(producerResult({ includeDecision: false }));
        assert.deepEqual(overlay.candidates[0].evidenceProofDigests, [
            "0994705a8819ff4c2bbe43f4790e07abd00e904e2a7e87cd5d33c3b161def7a9",
        ]);
        assert.equal(overlay.candidates[0].candidateRevisionDigest, "f349c7c615d6696388bfa3d8f36caf5e7c12829f815486fae40aaad79009c221");
    });
    (0, node_test_1.it)("keeps legacy reviewed-overlay shelf visibility semantics", () => {
        for (const action of [
            "accept_for_review",
            "defer",
            "dismiss",
        ]) {
            const result = producerResult({ includeDecision: false });
            const overlay = build(result);
            const reviewed = (0, native_candidate_review_js_1.reduceTaskMapNativeCandidateReview)({
                result,
                overlay,
                expectedOwnerScopeDigest: overlay.ownerScopeDigest,
                assessedAt: ASSESSED_AT,
                candidateId: overlay.candidates[0].candidateId,
                expectedCandidateRevisionDigest: overlay.candidates[0].candidateRevisionDigest,
                action,
                idempotencyKeyDigest: digest(`legacy-${action}`),
                decidedAt: ASSESSED_AT,
            });
            const shelf = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateShelf)(result, reviewed, ASSESSED_AT);
            if (action === "dismiss") {
                assert.equal(shelf.candidates.length, 0);
            }
            else {
                assert.equal(shelf.candidates.length, 1);
                assert.equal(shelf.candidates[0].reviewState, action);
                assert.equal(shelf.candidates[0].reviewedOnly, true);
                assert.equal(shelf.candidates[0].acceptedWork, false);
            }
        }
    });
    (0, node_test_1.it)("excludes decisions and exposes only fresh action/commitment candidates", () => {
        const result = producerResult({ includeCommitment: true });
        assert.equal(result.snapshot?.meetings[0].evidence.some((row) => row.kind === "decision"), true);
        const overlay = build(result);
        const shelf = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateShelf)(result, overlay, ASSESSED_AT);
        assert.equal(overlay.candidates.length, 2);
        assert.deepEqual(shelf.candidates.map((row) => row.kind).sort(), ["action_item", "commitment"]);
        assert.equal(shelf.candidates.some((row) => row.title.includes("DECISION")), false);
        assert.equal(shelf.candidates.every((row) => row.acceptedWork === false
            && row.rankEligible === false
            && row.routeEligible === false
            && row.proveEligible === false
            && row.runEligible === false), true);
    });
    (0, node_test_1.it)("keeps candidate identity stable while revision/facet changes rotate proof", () => {
        const firstResult = producerResult();
        const first = build(firstResult);
        const reviewed = (0, native_candidate_review_js_1.reduceTaskMapNativeCandidateReview)({
            result: firstResult,
            overlay: first,
            expectedOwnerScopeDigest: first.ownerScopeDigest,
            assessedAt: ASSESSED_AT,
            candidateId: first.candidates[0].candidateId,
            expectedCandidateRevisionDigest: first.candidates[0].candidateRevisionDigest,
            action: "accept_for_review",
            idempotencyKeyDigest: digest("review-first-revision"),
            decidedAt: ASSESSED_AT,
        });
        const updatedResult = producerResult({
            revision: "PRIVATE_REVISION_SENTINEL_2",
            actionOverrides: {
                status: "done",
                deadline: "2026-08-01T17:00:00.000Z",
                quality: "source_native",
                coverage: "complete",
                confidence: 1,
            },
        });
        const updated = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateReview)({
            result: updatedResult,
            previous: reviewed,
            expectedOwnerScopeDigest: reviewed.ownerScopeDigest,
            assessedAt: ASSESSED_AT,
        });
        assert.equal(updated.candidates[0].candidateId, first.candidates[0].candidateId);
        assert.equal(updated.candidates[0].statementReferenceDigest, first.candidates[0].statementReferenceDigest);
        assert.notEqual(updated.candidates[0].candidateRevisionDigest, first.candidates[0].candidateRevisionDigest);
        assert.notDeepEqual(updated.candidates[0].evidenceProofDigests, first.candidates[0].evidenceProofDigests);
        assert.equal((0, native_candidate_review_js_1.buildTaskMapNativeCandidateShelf)(updatedResult, updated, ASSESSED_AT).candidates[0].reviewState, "unreviewed");
    });
    (0, node_test_1.it)("fails closed on stale producer, stale candidate revision, and wrong owner", () => {
        const stale = producerResult({ assessedAt: VALID_THROUGH });
        assert.throws(() => (0, native_candidate_review_js_1.buildTaskMapNativeCandidateReview)({
            result: stale,
            previous: null,
            expectedOwnerScopeDigest: (0, confirmed_owner_js_1.testOwnerScopeDigest)("owner-a"),
            assessedAt: VALID_THROUGH,
        }), /not authenticated fresh input/);
        const firstResult = producerResult();
        const first = build(firstResult);
        assert.throws(() => (0, native_candidate_review_js_1.buildTaskMapNativeCandidateReview)({
            result: firstResult,
            previous: null,
            expectedOwnerScopeDigest: (0, confirmed_owner_js_1.testOwnerScopeDigest)("owner-b"),
            assessedAt: ASSESSED_AT,
        }), /owner scope/);
        assert.throws(() => (0, native_candidate_review_js_1.buildTaskMapNativeCandidateReview)({
            result: producerResult({ owner: "owner-b" }),
            previous: first,
            expectedOwnerScopeDigest: (0, confirmed_owner_js_1.testOwnerScopeDigest)("owner-b"),
            assessedAt: ASSESSED_AT,
        }), /previous overlay owner scope/);
        const changed = producerResult({
            revision: "PRIVATE_REVISION_SENTINEL_2",
            actionOverrides: { status: "done" },
        });
        assert.throws(() => (0, native_candidate_review_js_1.reduceTaskMapNativeCandidateReview)({
            result: changed,
            overlay: first,
            expectedOwnerScopeDigest: first.ownerScopeDigest,
            assessedAt: ASSESSED_AT,
            candidateId: first.candidates[0].candidateId,
            expectedCandidateRevisionDigest: first.candidates[0].candidateRevisionDigest,
            action: "dismiss",
            idempotencyKeyDigest: digest("stale-review"),
            decidedAt: ASSESSED_AT,
        }), /candidate revision is stale/);
    });
    (0, node_test_1.it)("replays review decisions idempotently without accepting work", () => {
        const result = producerResult();
        const overlay = build(result);
        const input = {
            result,
            overlay,
            expectedOwnerScopeDigest: overlay.ownerScopeDigest,
            assessedAt: ASSESSED_AT,
            candidateId: overlay.candidates[0].candidateId,
            expectedCandidateRevisionDigest: overlay.candidates[0].candidateRevisionDigest,
            action: "accept_for_review",
            idempotencyKeyDigest: digest("idempotent-review"),
            decidedAt: ASSESSED_AT,
        };
        const first = (0, native_candidate_review_js_1.reduceTaskMapNativeCandidateReview)(input);
        const replay = (0, native_candidate_review_js_1.reduceTaskMapNativeCandidateReview)({
            ...input,
            overlay: first,
        });
        assert.equal((0, native_candidate_review_js_1.taskMapNativeCandidateReviewCanonicalBytes)(replay), (0, native_candidate_review_js_1.taskMapNativeCandidateReviewCanonicalBytes)(first));
        assert.deepEqual(first.candidates[0].review, {
            decisionId: first.candidates[0].review?.decisionId,
            action: "accept_for_review",
            idempotencyKeyDigest: digest("idempotent-review"),
            reviewedCandidateRevisionDigest: first.candidates[0].candidateRevisionDigest,
            decidedAt: ASSESSED_AT,
            reviewedOnly: true,
            acceptedWork: false,
        });
        const shelf = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateShelf)(result, first, ASSESSED_AT);
        assert.equal(shelf.candidates[0].reviewState, "accept_for_review");
        assert.equal(shelf.candidates[0].acceptedWork, false);
        assert.throws(() => (0, native_candidate_review_js_1.reduceTaskMapNativeCandidateReview)({
            ...input,
            overlay: first,
            action: "dismiss",
        }), /idempotency key conflicts/);
    });
    (0, node_test_1.it)("keeps display strings in memory and persists digest-only privacy state", () => {
        const result = producerResult();
        const overlay = build(result);
        const shelf = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateShelf)(result, overlay, ASSESSED_AT);
        const bytes = (0, native_candidate_review_js_1.taskMapNativeCandidateReviewCanonicalBytes)(overlay);
        assert.equal(shelf.candidates[0].title, ACTION_TITLE);
        assert.equal(shelf.candidates[0].summary, ACTION_SUMMARY);
        assert.deepEqual(shelf.candidates[0].sourceKinds, ["gemini_meet"]);
        for (const sentinel of [
            ACTION_TITLE,
            ACTION_SUMMARY,
            "PRIVATE_DECISION_TITLE_SENTINEL",
            "PRIVATE_DECISION_SUMMARY_SENTINEL",
            "PRIVATE_DOCUMENT_ID_SENTINEL",
            "PRIVATE_REVISION_SENTINEL_1",
            "PRIVATE_URL_REFERENCE_SENTINEL",
            "gemini_meet",
        ]) {
            assert.equal(bytes.includes(sentinel), false, sentinel);
        }
        assert.equal(bytes.includes('"displayTextStored":false'), true);
        assert.equal(bytes.includes('"acceptedProjectionStored":false'), true);
        assert.equal(bytes.includes('"acceptedWorkStored":false'), true);
        (0, native_candidate_review_js_1.assertTaskMapNativeCandidateReview)(JSON.parse(bytes));
    });
    (0, node_test_1.it)("writes/loads canonical 0600 bytes under 0700 and refuses unsafe modes/symlinks", async () => {
        const overlay = build();
        const overlayPath = tempOverlayPath();
        await (0, native_candidate_review_js_1.writeTaskMapNativeCandidateReview)({
            overlayPath,
            expectedOwnerScopeDigest: overlay.ownerScopeDigest,
            overlay,
        });
        assert.equal((0, node_fs_1.statSync)(node_path_1.default.dirname(overlayPath)).mode & 0o777, 0o700);
        assert.equal((0, node_fs_1.statSync)(overlayPath).mode & 0o777, 0o600);
        assert.equal((0, node_fs_1.readFileSync)(overlayPath, "utf8"), (0, native_candidate_review_js_1.taskMapNativeCandidateReviewCanonicalBytes)(overlay));
        assert.deepEqual(await (0, native_candidate_review_js_1.loadTaskMapNativeCandidateReview)({
            overlayPath,
            expectedOwnerScopeDigest: overlay.ownerScopeDigest,
        }), overlay);
        (0, node_fs_1.chmodSync)(overlayPath, 0o644);
        await assert.rejects((0, native_candidate_review_js_1.loadTaskMapNativeCandidateReview)({
            overlayPath,
            expectedOwnerScopeDigest: overlay.ownerScopeDigest,
        }), /file authentication failed/);
        (0, node_fs_1.chmodSync)(overlayPath, 0o600);
        const linkPath = node_path_1.default.join(node_path_1.default.dirname(overlayPath), "review-link.json");
        (0, node_fs_1.symlinkSync)(overlayPath, linkPath);
        await assert.rejects((0, native_candidate_review_js_1.loadTaskMapNativeCandidateReview)({
            overlayPath: linkPath,
            expectedOwnerScopeDigest: overlay.ownerScopeDigest,
        }));
        await assert.rejects((0, native_candidate_review_js_1.writeTaskMapNativeCandidateReview)({
            overlayPath: linkPath,
            expectedOwnerScopeDigest: overlay.ownerScopeDigest,
            overlay,
        }), /not an owner-only 0600 regular file/);
        (0, node_fs_1.chmodSync)(node_path_1.default.dirname(overlayPath), 0o755);
        await assert.rejects((0, native_candidate_review_js_1.loadTaskMapNativeCandidateReview)({
            overlayPath,
            expectedOwnerScopeDigest: overlay.ownerScopeDigest,
        }), /0700 directory/);
        (0, node_fs_1.chmodSync)(node_path_1.default.dirname(overlayPath), 0o700);
    });
    (0, node_test_1.it)("has no accepted-quartet input and rejects caller-supplied quartet bytes unchanged", () => {
        const result = producerResult();
        const quartet = [
            Buffer.from("ACCEPTED_PROJECTION_BYTES_SENTINEL"),
            Buffer.from("CURRENTNESS_BYTES_SENTINEL"),
            Buffer.from("CURRENT_WORK_BYTES_SENTINEL"),
            Buffer.from("BODY_CONTEXT_BYTES_SENTINEL"),
        ];
        const before = quartet.map((bytes) => Buffer.from(bytes));
        const maliciousInput = {
            result,
            previous: null,
            expectedOwnerScopeDigest: result.snapshot?.ownerScopeDigest,
            assessedAt: ASSESSED_AT,
            acceptedProjectionBytes: quartet[0],
            currentnessBytes: quartet[1],
            currentWorkBytes: quartet[2],
            bodyContextBytes: quartet[3],
        };
        assert.throws(() => (0, native_candidate_review_js_1.buildTaskMapNativeCandidateReview)(maliciousInput), /unsupported or missing fields/);
        quartet.forEach((bytes, index) => {
            assert.deepEqual(bytes, before[index]);
        });
    });
});
const AGENT_PRODUCED_AT = "2026-07-30T08:00:00.000Z";
const AGENT_ASSESSED_AT = "2026-07-30T09:00:00.000Z";
function agentObservation(input) {
    const directive = input.directive ?? "Repair the candidate review adapter";
    const outcome = input.outcome ?? "Prepared the review-only candidate proof.";
    const occurredAt = input.occurredAt ?? "2026-07-30T07:00:00.000Z";
    if (input.provider === "codex") {
        return {
            provider: "codex",
            rawJsonl: [
                JSON.stringify({
                    timestamp: occurredAt,
                    type: "session_meta",
                    payload: { id: input.sessionId },
                }),
                JSON.stringify({
                    timestamp: occurredAt,
                    type: "turn_context",
                    payload: { cwd: "/Users/private/DaobrewAI" },
                }),
                JSON.stringify({
                    timestamp: occurredAt,
                    type: "response_item",
                    payload: {
                        id: input.turnId,
                        type: "message",
                        role: "user",
                        content: [{ type: "input_text", text: directive }],
                    },
                }),
                JSON.stringify({
                    timestamp: "2026-07-30T07:01:00.000Z",
                    type: "reasoning",
                    payload: { summary: "PRIVATE_REASONING_SENTINEL" },
                }),
                JSON.stringify({
                    timestamp: "2026-07-30T07:02:00.000Z",
                    type: "response_item",
                    payload: {
                        type: "function_call",
                        arguments: "PRIVATE_TOOL_ARGUMENT_SENTINEL",
                    },
                }),
                JSON.stringify({
                    timestamp: "2026-07-30T07:03:00.000Z",
                    type: "response_item",
                    payload: {
                        type: "message",
                        role: "assistant",
                        content: [{ type: "output_text", text: outcome }],
                    },
                }),
            ].join("\n") + "\n",
        };
    }
    return {
        provider: "claude",
        rawJsonl: [
            JSON.stringify({
                timestamp: occurredAt,
                sessionId: input.sessionId,
                uuid: input.turnId,
                cwd: "/Users/private/DaobrewAI",
                type: "user",
                message: { role: "user", content: directive },
            }),
            JSON.stringify({
                timestamp: "2026-07-30T07:03:00.000Z",
                sessionId: input.sessionId,
                type: "assistant",
                message: {
                    role: "assistant",
                    content: [
                        { type: "thinking", thinking: "PRIVATE_REASONING_SENTINEL" },
                        {
                            type: "tool_use",
                            name: "Bash",
                            input: { command: "PRIVATE_TOOL_ARGUMENT_SENTINEL" },
                        },
                        { type: "text", text: outcome },
                    ],
                },
            }),
        ].join("\n") + "\n",
    };
}
function agentAdmission(observations, owner = "owner-agent") {
    return (0, agent_session_semantic_admission_js_1.buildTaskMapAgentSessionSemanticAdmission)((0, agent_session_producer_freshness_js_1.buildTaskMapAgentSessionProducerSnapshot)({
        ownerScopeDigest: (0, confirmed_owner_js_1.testOwnerScopeDigest)(owner),
        producedAt: AGENT_PRODUCED_AT,
        observations,
    }));
}
(0, node_test_1.describe)("agent-session native candidate adapter", () => {
    (0, node_test_1.it)("turns one semantic cluster into one exact owner-bound v2 candidate", () => {
        const admission = agentAdmission([
            agentObservation({
                provider: "codex",
                sessionId: "PRIVATE_CODEX_SESSION_ID",
                turnId: "native-variant-codex",
            }),
            agentObservation({
                provider: "claude",
                sessionId: "PRIVATE_CLAUDE_SESSION_ID",
                turnId: "native-variant-claude",
            }),
        ]);
        const projection = (0, agent_session_candidate_adapter_js_1.buildTaskMapAgentSessionCandidateReview)({
            admission,
            extraction: (0, taskmap_agent_session_extraction_fixture_js_1.buildAgentSessionExtractionFixture)(admission, AGENT_ASSESSED_AT),
            previous: null,
            expectedOwnerScopeDigest: admission.ownerScopeDigest,
            assessedAt: AGENT_ASSESSED_AT,
        });
        assert.equal(projection.shelf.contractVersion, "taskmap-native-candidate-shelf.v2");
        assert.equal(projection.shelf.candidates.length, 1);
        const row = projection.shelf.candidates[0];
        assert.equal(row.candidateFamily, "agent_session");
        assert.equal(row.kind, "action_item");
        assert.deepEqual(row.sourceKinds, ["claude_session", "codex_session"]);
        assert.equal(row.originIdentityDigest, admission.clusters[0].clusterIdentityDigest);
        assert.equal(row.supportSetRevisionDigest, row.candidateRevisionDigest);
        assert.equal(row.evidenceProofDigests.length, 2);
        assert.ok(row.title.length <= 96);
        assert.ok(row.summary.length <= 200);
        assert.equal(row.sourceWritebackEligible, false);
        assert.equal(row.runEligible, false);
        (0, native_candidate_review_js_1.assertTaskMapNativeCandidateShelfV2)(projection.shelf);
        (0, native_candidate_review_js_1.assertTaskMapNativeCandidateReview)(projection.overlay);
    });
    (0, node_test_1.it)("retains meeting shelf v1 and upgrades it without changing durable proofs", () => {
        const result = producerResult({
            actionOverrides: {
                title: "Review https://meet.example/notes",
                summary: "Follow the valid HTTP(S) source semantics.",
            },
        });
        const overlay = build(result);
        const v1 = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateShelf)(result, overlay, ASSESSED_AT);
        const v1Bytes = JSON.stringify(v1);
        const v2 = (0, native_candidate_review_js_1.upgradeTaskMapNativeCandidateShelfV1)(v1);
        assert.equal(v1.contractVersion, "taskmap-native-candidate-shelf.v1");
        assert.equal(JSON.stringify(v1), v1Bytes);
        assert.equal(v2.contractVersion, "taskmap-native-candidate-shelf.v2");
        assert.ok(v2.candidates.every((row) => row.candidateFamily === "meeting"));
        (0, native_candidate_review_js_1.assertTaskMapNativeCandidateShelfV2)(v2);
    });
    (0, node_test_1.it)("rejects forged v2 meeting kind, confidence, authority, sources, and speech provenance", () => {
        const result = producerResult();
        const overlay = build(result);
        const valid = (0, native_candidate_review_js_1.upgradeTaskMapNativeCandidateShelfV1)((0, native_candidate_review_js_1.buildTaskMapNativeCandidateShelf)(result, overlay, ASSESSED_AT));
        const meetingIndex = valid.candidates.findIndex((row) => row.candidateFamily === "meeting");
        assert.notEqual(meetingIndex, -1);
        const forgeries = [
            (row) => { row.kind = "agent_session"; },
            (row) => { row.confidence = 1.01; },
            (row) => { row.confidence = Number.NaN; },
            (row) => { row.acceptedWork = true; },
            (row) => { row.rankEligible = true; },
            (row) => { row.routeEligible = true; },
            (row) => { row.proveEligible = true; },
            (row) => { row.runEligible = true; },
            (row) => { row.promotionEligible = "true"; },
            (row) => { row.sourceKinds = ["gemini_meet", "gemini_meet"]; },
            (row) => { row.sourceKinds = ["granola", "gemini_meet"]; },
            (row) => { row.speechActClass = "request"; },
            (row) => {
                row.speechActClass = "request";
                row.speechActActor = "self";
                row.mentionIdentityDigest = "not-a-digest";
            },
            (row) => {
                row.speechActClass = "unsupported";
                row.speechActActor = "self";
                row.mentionIdentityDigest = digest("mention");
            },
            (row) => {
                row.speechActClass = "request";
                row.speechActActor = "unsupported";
                row.mentionIdentityDigest = digest("mention");
            },
        ];
        for (const forge of forgeries) {
            const shelf = structuredClone(valid);
            const row = shelf.candidates[meetingIndex];
            forge(row);
            assert.throws(() => (0, native_candidate_review_js_1.assertTaskMapNativeCandidateShelfV2)(shelf), /meeting|candidate|confidence|source|speech|invalid/i);
        }
    });
    (0, node_test_1.it)("deduplicates copied native lineage but retains distinct native variants", () => {
        const admission = agentAdmission([
            agentObservation({
                provider: "codex",
                sessionId: "fork-a",
                turnId: "copied-native-turn",
            }),
            agentObservation({
                provider: "codex",
                sessionId: "fork-b",
                turnId: "copied-native-turn",
            }),
            agentObservation({
                provider: "claude",
                sessionId: "variant-c",
                turnId: "different-native-turn",
            }),
        ]);
        assert.equal(admission.clusters.length, 1);
        assert.equal(admission.clusters[0].supports.length, 2);
        const projection = (0, agent_session_candidate_adapter_js_1.buildTaskMapAgentSessionCandidateReview)({
            admission,
            extraction: (0, taskmap_agent_session_extraction_fixture_js_1.buildAgentSessionExtractionFixture)(admission, AGENT_ASSESSED_AT),
            previous: null,
            expectedOwnerScopeDigest: admission.ownerScopeDigest,
            assessedAt: AGENT_ASSESSED_AT,
        });
        assert.equal(projection.shelf.candidates[0].evidenceProofDigests.length, 2);
        const withoutCopy = agentAdmission([
            agentObservation({
                provider: "codex",
                sessionId: "fork-a",
                turnId: "copied-native-turn",
            }),
            agentObservation({
                provider: "claude",
                sessionId: "variant-c",
                turnId: "different-native-turn",
            }),
        ]);
        const baseline = (0, agent_session_candidate_adapter_js_1.buildTaskMapAgentSessionCandidateReview)({
            admission: withoutCopy,
            extraction: (0, taskmap_agent_session_extraction_fixture_js_1.buildAgentSessionExtractionFixture)(withoutCopy, AGENT_ASSESSED_AT),
            previous: null,
            expectedOwnerScopeDigest: withoutCopy.ownerScopeDigest,
            assessedAt: AGENT_ASSESSED_AT,
        });
        assert.equal(projection.shelf.candidates[0].candidateRevisionDigest, baseline.shelf.candidates[0].candidateRevisionDigest);
    });
    (0, node_test_1.it)("rejects wrong-owner, stale, unsafe, disposed, unrouted, and unknown input", () => {
        const admission = agentAdmission([
            agentObservation({ provider: "codex", sessionId: "s1", turnId: "t1" }),
        ]);
        const base = {
            admission,
            extraction: (0, taskmap_agent_session_extraction_fixture_js_1.buildAgentSessionExtractionFixture)(admission, AGENT_ASSESSED_AT),
            previous: null,
            expectedOwnerScopeDigest: admission.ownerScopeDigest,
            assessedAt: AGENT_ASSESSED_AT,
        };
        assert.throws(() => (0, agent_session_candidate_adapter_js_1.buildTaskMapAgentSessionCandidateReview)({
            ...base,
            expectedOwnerScopeDigest: digest("wrong-owner"),
        }), /owner/i);
        assert.throws(() => (0, agent_session_candidate_adapter_js_1.buildTaskMapAgentSessionCandidateReview)({
            ...base,
            assessedAt: "2026-07-30T12:00:00.000Z",
        }), /stale/i);
        assert.throws(() => (0, agent_session_candidate_adapter_js_1.buildTaskMapAgentSessionCandidateReview)({
            ...base,
            surprise: true,
        }), /unexpected|fields/i);
        for (const mutation of [
            { userDirectiveSummary: "/Users/private/secret.md" },
            { proposalDisposition: "disposed" },
            { providerNeutralRoutingDigest: digest("unrouted") },
        ]) {
            const tampered = structuredClone(admission);
            Object.assign(tampered.clusters[0], mutation);
            assert.throws(() => (0, agent_session_candidate_adapter_js_1.buildTaskMapAgentSessionCandidateReview)({
                ...base,
                admission: tampered,
            }));
        }
    });
    (0, node_test_1.it)("rejects stale support overlays and mixed meeting-agent source rows", () => {
        const first = agentAdmission([
            agentObservation({ provider: "codex", sessionId: "s1", turnId: "t1" }),
        ]);
        const firstProjection = (0, agent_session_candidate_adapter_js_1.buildTaskMapAgentSessionCandidateReview)({
            admission: first,
            extraction: (0, taskmap_agent_session_extraction_fixture_js_1.buildAgentSessionExtractionFixture)(first, AGENT_ASSESSED_AT),
            previous: null,
            expectedOwnerScopeDigest: first.ownerScopeDigest,
            assessedAt: AGENT_ASSESSED_AT,
        });
        const changed = agentAdmission([
            agentObservation({ provider: "codex", sessionId: "s1", turnId: "t1" }),
            agentObservation({ provider: "claude", sessionId: "s2", turnId: "t2" }),
        ]);
        assert.throws(() => (0, agent_session_candidate_adapter_js_1.buildTaskMapAgentSessionCandidateShelf)({
            admission: changed,
            extraction: (0, taskmap_agent_session_extraction_fixture_js_1.buildAgentSessionExtractionFixture)(changed, AGENT_ASSESSED_AT),
            overlay: firstProjection.overlay,
            expectedOwnerScopeDigest: changed.ownerScopeDigest,
            assessedAt: AGENT_ASSESSED_AT,
        }), /stale|support|match/i);
        const changedProjection = (0, agent_session_candidate_adapter_js_1.buildTaskMapAgentSessionCandidateReview)({
            admission: changed,
            extraction: (0, taskmap_agent_session_extraction_fixture_js_1.buildAgentSessionExtractionFixture)(changed, AGENT_ASSESSED_AT),
            previous: firstProjection.overlay,
            expectedOwnerScopeDigest: changed.ownerScopeDigest,
            assessedAt: AGENT_ASSESSED_AT,
        });
        assert.equal(changedProjection.shelf.candidates[0].candidateId, firstProjection.shelf.candidates[0].candidateId);
        assert.notEqual(changedProjection.shelf.candidates[0].candidateRevisionDigest, firstProjection.shelf.candidates[0].candidateRevisionDigest);
        const mixed = structuredClone(firstProjection.shelf);
        mixed.candidates[0].sourceKinds.push("granola");
        assert.throws(() => (0, native_candidate_review_js_1.assertTaskMapNativeCandidateShelfV2)(mixed), /mixed|source/i);
    });
    (0, node_test_1.it)("rejects a re-signed agent statement that is not bound to its owner and origin", () => {
        const admission = agentAdmission([
            agentObservation({ provider: "codex", sessionId: "s1", turnId: "t1" }),
        ]);
        const projection = (0, agent_session_candidate_adapter_js_1.buildTaskMapAgentSessionCandidateReview)({
            admission,
            extraction: (0, taskmap_agent_session_extraction_fixture_js_1.buildAgentSessionExtractionFixture)(admission, AGENT_ASSESSED_AT),
            previous: null,
            expectedOwnerScopeDigest: admission.ownerScopeDigest,
            assessedAt: AGENT_ASSESSED_AT,
        });
        const forged = structuredClone(projection.shelf);
        const row = forged.candidates[0];
        assert.equal(row.candidateFamily, "agent_session");
        const forgedStatement = digest("forged-agent-statement");
        row.statementReferenceDigest = forgedStatement;
        row.candidateId = (0, native_candidate_review_js_1.taskMapNativeCandidateId)(forged.ownerScopeDigest, forgedStatement);
        row.candidateRevisionDigest = (0, native_candidate_review_js_1.taskMapNativeCandidateRevisionDigest)(row.candidateId, row.evidenceProofDigests);
        if (row.candidateFamily === "agent_session") {
            row.supportSetRevisionDigest = row.candidateRevisionDigest;
        }
        assert.throws(() => (0, native_candidate_review_js_1.assertTaskMapNativeCandidateShelfV2)(forged), /statement|origin|identity/i);
    });
    (0, node_test_1.it)("exposes no transcript, path, session id, tool args, reasoning, or writeback capability", () => {
        const admission = agentAdmission([agentObservation({
                provider: "codex",
                sessionId: "PRIVATE_SESSION_ID_SENTINEL",
                turnId: "private-turn-id",
                directive: "Run --config=/root/.ssh/id_rsa and path:/workspace/private.txt then /quit using api_key=PRIVATE_KEY_SENTINEL",
                outcome: "saved=/srv/secrets/report.txt; see https://private.example/report",
            })]);
        const projection = (0, agent_session_candidate_adapter_js_1.buildTaskMapAgentSessionCandidateReview)({
            admission,
            extraction: (0, taskmap_agent_session_extraction_fixture_js_1.buildAgentSessionExtractionFixture)(admission, AGENT_ASSESSED_AT),
            previous: null,
            expectedOwnerScopeDigest: admission.ownerScopeDigest,
            assessedAt: AGENT_ASSESSED_AT,
        });
        const bytes = JSON.stringify(projection);
        for (const sentinel of [
            "/Users/private",
            "PRIVATE_SESSION_ID_SENTINEL",
            "private-turn-id",
            "PRIVATE_TOOL_ARGUMENT_SENTINEL",
            "PRIVATE_REASONING_SENTINEL",
            "PRIVATE_KEY_SENTINEL",
            "private.example",
            "/root/.ssh/id_rsa",
            "/workspace/private.txt",
            "/srv/secrets/report.txt",
        ])
            assert.equal(bytes.includes(sentinel), false, sentinel);
        assert.equal(bytes.includes("rawJsonl"), false);
        assert.equal(bytes.includes("toolArguments"), false);
        assert.equal(bytes.includes("chainOfThought"), false);
        const candidate = projection.shelf.candidates[0];
        if (candidate.candidateFamily !== "agent_session") {
            assert.fail("expected an agent candidate");
        }
        assert.match(`${candidate.title} ${candidate.summary}`, /\[local-path\]/);
        assert.match(candidate.title, /\/quit/);
        assert.equal(candidate.sourceWritebackEligible, false);
    });
});
