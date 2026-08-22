"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_CALENDAR_CANDIDATE_EVIDENCE_DOMAIN = void 0;
exports.buildTaskMapCalendarCandidateShelf = buildTaskMapCalendarCandidateShelf;
exports.buildTaskMapCalendarCandidateReview = buildTaskMapCalendarCandidateReview;
const native_candidate_review_js_1 = require("./native-candidate-review.js");
const source_contracts_js_1 = require("./source-contracts.js");
const text_contract_js_1 = require("./text-contract.js");
exports.TASKMAP_CALENDAR_CANDIDATE_EVIDENCE_DOMAIN = "taskmap-calendar-candidate-evidence.1";
function fail(message) {
    throw new Error(`Task Map calendar candidate adapter: ${message}`);
}
function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
function assertExactKeys(value, expected, label) {
    if (!isPlainObject(value))
        fail(`${label} must be an object`);
    const actual = Object.keys(value).sort();
    const keys = [...expected].sort();
    if (actual.length !== keys.length
        || actual.some((key, index) => key !== keys[index]))
        fail(`${label} has unexpected or missing fields`);
}
function canonicalAssessedAt(value) {
    if (typeof value !== "string"
        || !Number.isFinite(Date.parse(value))
        || new Date(Date.parse(value)).toISOString() !== value)
        fail("assessedAt must be a canonical timestamp");
    return value;
}
function compareCodePoints(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
function deepFreeze(value) {
    if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) {
            deepFreeze(child);
        }
        Object.freeze(value);
    }
    return value;
}
function mentionKind(mention) {
    return mention.speechActClass === "commitment" ? "commitment"
        : mention.speechActClass === "decision" ? "decision"
            : "action_item";
}
function occurrenceProofs(ownerScopeDigest, occurrence) {
    if (occurrence.segment.envelopeDigest === null) {
        fail("extracted segment has no station envelope");
    }
    if (occurrence.events.length === 0) {
        fail("extracted segment has no current calendar events");
    }
    return occurrence.events.map((event) => (0, source_contracts_js_1.taskMapContractDigest)({
        domain: exports.TASKMAP_CALENDAR_CANDIDATE_EVIDENCE_DOMAIN,
        ownerScopeDigest,
        mentionIdentityDigest: occurrence.mention.mentionIdentityDigest,
        envelopeDigest: occurrence.segment.envelopeDigest,
        inputDigest: occurrence.segment.inputDigest,
        eventIdentityDigest: event.eventIdentityDigest,
        eventRevisionDigest: event.revisionDigest,
    }));
}
function deriveCalendarCandidates(result, extraction, expectedOwnerScopeDigest, assessedAtInput) {
    const assessedAt = canonicalAssessedAt(assessedAtInput);
    if (result.ownerScopeDigest !== expectedOwnerScopeDigest
        || extraction.ownerScopeDigest !== expectedOwnerScopeDigest)
        fail("calendar input belongs to another owner");
    if (extraction.resultDigest !== result.resultDigest) {
        fail("extraction does not match current calendar result");
    }
    if (result.availability !== "available") {
        fail("calendar result is unavailable");
    }
    const eventByIdentity = new Map(result.events.map((event) => [
        event.eventIdentityDigest,
        event,
    ]));
    const occurrences = extraction.segments.flatMap((segment) => {
        if (segment.status === "degraded")
            return [];
        const events = segment.eventIdentityDigests.map((identity) => {
            const event = eventByIdentity.get(identity);
            if (event === undefined)
                fail("extraction segment has no current event");
            return event;
        });
        return segment.mentions.map((mention) => ({ segment, mention, events }));
    });
    const byMention = new Map();
    for (const occurrence of occurrences) {
        const identity = occurrence.mention.mentionIdentityDigest;
        const current = byMention.get(identity) ?? [];
        current.push(occurrence);
        byMention.set(identity, current);
    }
    const rows = [...byMention.entries()].map(([mentionIdentityDigest, rows]) => {
        const ordered = [...rows].sort((left, right) => right.mention.confidence - left.mention.confidence
            || left.segment.segmentIndex - right.segment.segmentIndex
            || compareCodePoints(left.segment.inputDigest, right.segment.inputDigest));
        const representative = ordered[0];
        const statementReferenceDigest = (0, native_candidate_review_js_1.taskMapCalendarCandidateStatementReferenceDigest)(result.ownerScopeDigest, mentionIdentityDigest);
        const candidateId = (0, native_candidate_review_js_1.taskMapNativeCandidateId)(result.ownerScopeDigest, statementReferenceDigest);
        const proofDigests = [...new Set(ordered.flatMap((occurrence) => occurrenceProofs(result.ownerScopeDigest, occurrence)))].sort(compareCodePoints);
        const candidateRevisionDigest = (0, native_candidate_review_js_1.taskMapNativeCandidateRevisionDigest)(candidateId, proofDigests);
        const earliestEventStart = ordered.flatMap((occurrence) => occurrence.events)
            .reduce((earliest, event) => event.startAt < earliest ? event.startAt : earliest, ordered[0].events[0].startAt);
        const occurredAt = earliestEventStart < assessedAt
            ? earliestEventStart
            : assessedAt;
        return {
            candidateId,
            candidateRevisionDigest,
            statementReferenceDigest,
            evidenceProofDigests: proofDigests,
            candidateFamily: "calendar",
            kind: mentionKind(representative.mention),
            title: (0, text_contract_js_1.boundedUtf16)(representative.mention.title, native_candidate_review_js_1.TASKMAP_NATIVE_CANDIDATE_REVIEW_LIMITS_V1.maxTitleCharacters),
            summary: (0, text_contract_js_1.boundedUtf16)(representative.mention.text, native_candidate_review_js_1.TASKMAP_NATIVE_CANDIDATE_REVIEW_LIMITS_V1.maxSummaryCharacters),
            speechActClass: representative.mention.speechActClass,
            speechActActor: representative.mention.speechActActor,
            confidence: Math.max(...ordered.map((row) => row.mention.confidence)),
            mentionIdentityDigest,
            sourceKinds: ["calendar"],
            originIdentityDigest: mentionIdentityDigest,
            supportSetRevisionDigest: candidateRevisionDigest,
            proposalDisposition: representative.mention.proposalDisposition,
            occurredAt,
            observedAt: assessedAt,
            reviewState: "unreviewed",
            reviewedAt: null,
            reviewedOnly: false,
            promotionEligible: ordered.every((row) => row.mention.promotionEligible === true),
            acceptedWork: false,
            sourceWritebackEligible: false,
            rankEligible: false,
            routeEligible: false,
            proveEligible: false,
            runEligible: false,
        };
    }).sort((left, right) => compareCodePoints(left.candidateId, right.candidateId));
    const context = {
        ownerScopeDigest: result.ownerScopeDigest,
        producerResultDigest: extraction.reportDigest,
        producerSnapshotDigest: result.resultDigest,
        producedAt: result.assessedAt,
        assessedAt,
        candidates: rows,
    };
    return { context, rows };
}
function shelfFromDerived(derived, overlay) {
    (0, native_candidate_review_js_1.assertTaskMapNativeCandidateReview)(overlay);
    if (overlay.ownerScopeDigest !== derived.context.ownerScopeDigest
        || overlay.producerResultDigest !== derived.context.producerResultDigest
        || overlay.producerSnapshotDigest !== derived.context.producerSnapshotDigest)
        fail("candidate overlay does not match current calendar evidence");
    const reviewed = (0, native_candidate_review_js_1.applyTaskMapNativeCandidateReviewToProofRows)({
        context: derived.context,
        overlay,
    });
    const candidates = reviewed.map((reviewedRow) => {
        const display = derived.rows.find((row) => row.candidateId === reviewedRow.candidateId);
        if (display === undefined)
            fail("review row has no current candidate proof");
        return {
            ...display,
            reviewState: reviewedRow.reviewState,
            reviewedAt: reviewedRow.reviewedAt,
            reviewedOnly: reviewedRow.reviewedOnly,
        };
    });
    const shelf = {
        contractVersion: native_candidate_review_js_1.TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION_V2,
        ownerScopeDigest: derived.context.ownerScopeDigest,
        producerResultDigest: derived.context.producerResultDigest,
        producerSnapshotDigest: derived.context.producerSnapshotDigest,
        assessedAt: derived.context.assessedAt,
        candidates,
        displayTextPersistence: "memory_only",
    };
    (0, native_candidate_review_js_1.assertTaskMapNativeCandidateShelfV2)(shelf);
    return deepFreeze(shelf);
}
function buildTaskMapCalendarCandidateShelf(input) {
    assertExactKeys(input, [
        "assessedAt", "expectedOwnerScopeDigest", "extraction", "overlay", "result",
    ], "calendar candidate shelf input");
    const derived = deriveCalendarCandidates(input.result, input.extraction, input.expectedOwnerScopeDigest, input.assessedAt);
    return shelfFromDerived(derived, input.overlay);
}
function buildTaskMapCalendarCandidateReview(input) {
    assertExactKeys(input, [
        "assessedAt", "expectedOwnerScopeDigest", "extraction", "previous", "result",
    ], "calendar candidate review input");
    const derived = deriveCalendarCandidates(input.result, input.extraction, input.expectedOwnerScopeDigest, input.assessedAt);
    const overlay = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateReviewFromProofRows)({
        context: derived.context,
        previous: input.previous,
    });
    const shelf = shelfFromDerived(derived, overlay);
    return deepFreeze({ overlay, shelf });
}
