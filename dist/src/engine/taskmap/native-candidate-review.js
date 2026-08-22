"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_CALENDAR_CANDIDATE_STATEMENT_DOMAIN = exports.TASKMAP_AGENT_SESSION_CANDIDATE_STATEMENT_DOMAIN = exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_LIMITS_V1 = exports.TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION_V3 = exports.TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION_V2 = exports.TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION = exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_POLICY_VERSION = exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_VERSION = void 0;
exports.upgradeTaskMapNativeCandidateShelfV1 = upgradeTaskMapNativeCandidateShelfV1;
exports.taskMapAgentSessionCandidateStatementReferenceDigest = taskMapAgentSessionCandidateStatementReferenceDigest;
exports.taskMapCalendarCandidateStatementReferenceDigest = taskMapCalendarCandidateStatementReferenceDigest;
exports.taskMapNativeCandidateId = taskMapNativeCandidateId;
exports.taskMapNativeCandidateRevisionDigest = taskMapNativeCandidateRevisionDigest;
exports.buildTaskMapNativeCandidateReviewFromProofRows = buildTaskMapNativeCandidateReviewFromProofRows;
exports.reduceTaskMapNativeCandidateReviewFromProofRows = reduceTaskMapNativeCandidateReviewFromProofRows;
exports.applyTaskMapNativeCandidateReviewToProofRows = applyTaskMapNativeCandidateReviewToProofRows;
exports.buildTaskMapNativeCandidateReview = buildTaskMapNativeCandidateReview;
exports.reduceTaskMapNativeCandidateReview = reduceTaskMapNativeCandidateReview;
exports.buildTaskMapNativeCandidateShelf = buildTaskMapNativeCandidateShelf;
exports.resolveTaskMapNativeCandidateProof = resolveTaskMapNativeCandidateProof;
exports.assertTaskMapNativeCandidateShelfV2 = assertTaskMapNativeCandidateShelfV2;
exports.assertTaskMapNativeCandidateShelfV3 = assertTaskMapNativeCandidateShelfV3;
exports.assertTaskMapNativeCandidateReview = assertTaskMapNativeCandidateReview;
exports.taskMapNativeCandidateReviewCanonicalBytes = taskMapNativeCandidateReviewCanonicalBytes;
exports.withTaskMapNativeCandidateReviewTransaction = withTaskMapNativeCandidateReviewTransaction;
exports.loadTaskMapNativeCandidateReview = loadTaskMapNativeCandidateReview;
exports.writeTaskMapNativeCandidateReview = writeTaskMapNativeCandidateReview;
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const meeting_producer_freshness_js_1 = require("./meeting-producer-freshness.js");
const source_contracts_js_1 = require("./source-contracts.js");
const native_candidate_hierarchy_js_1 = require("./native-candidate-hierarchy.js");
exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_VERSION = "taskmap-native-candidate-review.v1";
exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_POLICY_VERSION = "taskmap-native-candidate-review-policy.1";
exports.TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION = "taskmap-native-candidate-shelf.v1";
exports.TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION_V2 = "taskmap-native-candidate-shelf.v2";
exports.TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION_V3 = "taskmap-native-candidate-shelf.v3";
exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_LIMITS_V1 = Object.freeze({
    maxCandidates: 128,
    maxEvidenceProofsPerCandidate: 128,
    maxFileBytes: 256 * 1024,
    maxTitleCharacters: 96,
    maxSummaryCharacters: 200,
});
const CANDIDATE_IDENTITY_DOMAIN = "taskmap-native-candidate-identity.1";
const CANDIDATE_EVIDENCE_PROOF_DOMAIN = "taskmap-native-candidate-evidence-proof.1";
const CANDIDATE_REVISION_DOMAIN = "taskmap-native-candidate-revision.1";
exports.TASKMAP_AGENT_SESSION_CANDIDATE_STATEMENT_DOMAIN = "taskmap-agent-session-candidate-statement.3";
exports.TASKMAP_CALENDAR_CANDIDATE_STATEMENT_DOMAIN = "taskmap-calendar-candidate-statement.1";
const REVIEW_DECISION_DOMAIN = "taskmap-native-candidate-review-decision.1";
const OVERLAY_DIGEST_DOMAIN = "taskmap-native-candidate-review-overlay.1";
const SHA256 = /^[a-f0-9]{64}$/;
const CANDIDATE_ID = /^tmnativecandidate_[a-f0-9]{64}$/;
const DECISION_ID = /^tmnativecandidatereview_[a-f0-9]{64}$/;
const OVERLAY_ID = /^tmnativecandidateoverlay_[a-f0-9]{64}$/;
const STRICT_RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const CONTROL_CHARACTER = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const TRANSACTION_LOCK_VERSION = "taskmap-native-candidate-review-lock.v1";
const TRANSACTION_LOCK_WAIT_MS = 10_000;
const TRANSACTION_LOCK_POLL_MS = 50;
const TRANSACTION_LOCK_MAX_BYTES = 4 * 1_024;
const TRANSACTION_LOCK_TOKEN = /^[a-f0-9]{32}$/;
const PRIVACY = Object.freeze({
    displayTextStored: false,
    sourceTitlesStored: false,
    sourceSummariesStored: false,
    sourceBodiesStored: false,
    participantDetailsStored: false,
    rawUrlsStored: false,
    credentialsStored: false,
    localPathsStored: false,
    acceptedProjectionStored: false,
    acceptedWorkStored: false,
    rankRouteProveRunStateStored: false,
});
function upgradeTaskMapNativeCandidateShelfV1(shelf) {
    return deepFreeze({
        ...shelf,
        contractVersion: exports.TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION_V2,
        candidates: shelf.candidates.map((row) => ({
            ...row,
            evidenceProofDigests: [...row.evidenceProofDigests],
            sourceKinds: [...row.sourceKinds],
            candidateFamily: "meeting",
        })),
    });
}
function fail(message) {
    throw new Error(`M2C native candidate review: ${message}`);
}
function errnoCode(error) {
    if (error !== null
        && typeof error === "object"
        && "code" in error
        && typeof error.code === "string") {
        return error.code;
    }
    return undefined;
}
function assertPlainObject(value, label) {
    if (value === null
        || typeof value !== "object"
        || Array.isArray(value)
        || (Object.getPrototypeOf(value) !== Object.prototype
            && Object.getPrototypeOf(value) !== null)) {
        fail(`${label} must be a plain object`);
    }
}
function assertExactKeys(value, keys, label) {
    const expected = new Set(keys);
    const actual = Object.keys(value);
    if (actual.length !== expected.size
        || actual.some((key) => !expected.has(key))
        || keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
        fail(`${label} has unsupported or missing fields`);
    }
}
function assertDigest(value, label) {
    if (typeof value !== "string" || !SHA256.test(value)) {
        fail(`${label} must be a sha256 digest`);
    }
}
function canonicalTimestamp(value, label) {
    if (typeof value !== "string"
        || value.length > 64
        || !STRICT_RFC3339.test(value)) {
        fail(`${label} must be an RFC3339 timestamp`);
    }
    const epoch = Date.parse(value);
    if (!Number.isFinite(epoch)) {
        fail(`${label} must be an RFC3339 timestamp`);
    }
    return new Date(epoch).toISOString();
}
function assertCanonicalTimestamp(value, label) {
    if (typeof value !== "string"
        || canonicalTimestamp(value, label) !== value) {
        fail(`${label} must be a canonical RFC3339 timestamp`);
    }
}
function assertSortedUniqueDigests(value, label) {
    if (!Array.isArray(value)
        || value.length === 0
        || value.length
            > exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_LIMITS_V1
                .maxEvidenceProofsPerCandidate) {
        fail(`${label} must be a bounded non-empty array`);
    }
    let prior;
    for (const [index, digest] of value.entries()) {
        assertDigest(digest, `${label}[${index}]`);
        if (prior !== undefined && prior >= digest) {
            fail(`${label} must be sorted and unique`);
        }
        prior = digest;
    }
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
function compareCodePoints(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
function taskMapAgentSessionCandidateStatementReferenceDigest(ownerScopeDigest, originIdentityDigest, mentionIdentityDigest) {
    return (0, source_contracts_js_1.taskMapContractDigest)({
        domain: exports.TASKMAP_AGENT_SESSION_CANDIDATE_STATEMENT_DOMAIN,
        ownerScopeDigest,
        clusterIdentityDigest: originIdentityDigest,
        mentionIdentityDigest,
    });
}
function taskMapCalendarCandidateStatementReferenceDigest(ownerScopeDigest, mentionIdentityDigest) {
    return (0, source_contracts_js_1.taskMapContractDigest)({
        domain: exports.TASKMAP_CALENDAR_CANDIDATE_STATEMENT_DOMAIN,
        ownerScopeDigest,
        mentionIdentityDigest,
    });
}
function taskMapNativeCandidateId(ownerScopeDigest, statementReferenceDigest) {
    return `tmnativecandidate_${(0, source_contracts_js_1.taskMapContractDigest)({
        domain: CANDIDATE_IDENTITY_DOMAIN,
        ownerScopeDigest,
        statementReferenceDigest,
    })}`;
}
function taskMapNativeCandidateRevisionDigest(candidate, evidenceProofDigests) {
    return (0, source_contracts_js_1.taskMapContractDigest)({
        domain: CANDIDATE_REVISION_DOMAIN,
        candidateId: candidate,
        evidenceProofDigests,
    });
}
function decisionId(input) {
    return `tmnativecandidatereview_${(0, source_contracts_js_1.taskMapContractDigest)({
        domain: REVIEW_DECISION_DOMAIN,
        ...input,
    })}`;
}
function assertReviewAction(value) {
    if (value !== "accept_for_review"
        && value !== "dismiss"
        && value !== "defer") {
        fail("review action is unsupported");
    }
}
function assertFreshResultAt(result, assessedAtInput) {
    (0, meeting_producer_freshness_js_1.assertTaskMapMeetingProducerResult)(result);
    const assessedAt = canonicalTimestamp(assessedAtInput, "assessedAt");
    const snapshot = result.snapshot;
    if (result.availability !== "available"
        || result.freshness.decision !== "fresh"
        || !result.freshness.currentSemanticInputEligible
        || snapshot === null) {
        fail("producer result is not authenticated fresh input");
    }
    if (Date.parse(assessedAt) < Date.parse(result.freshness.assessedAt)
        || Date.parse(assessedAt) < Date.parse(snapshot.producedAt)
        || Date.parse(assessedAt) >= Date.parse(snapshot.validThrough)) {
        fail("producer result is stale at assessedAt");
    }
    return { assessedAt, snapshot };
}
function buildCandidateGroups(result) {
    const snapshot = result.snapshot;
    if (snapshot === null)
        fail("fresh producer snapshot is missing");
    const byStatement = new Map();
    for (const meeting of snapshot.meetings) {
        const sourceKindByVariantRef = new Map(meeting.sourceVariants.map((variant) => [
            variant.sourceVariantRefDigest,
            variant.sourceKind,
        ]));
        for (const evidence of meeting.evidence) {
            const hasSpeechActProvenance = evidence.speechActClass !== undefined;
            if (evidence.proposalDisposition !== "candidate_only"
                && !hasSpeechActProvenance)
                continue;
            if (!hasSpeechActProvenance
                && evidence.kind !== "action_item"
                && evidence.kind !== "commitment") {
                fail("candidate-only evidence kind is invalid");
            }
            if (evidence.statementReferenceDigest === null) {
                fail("suggestion evidence lacks a statement reference");
            }
            if (hasSpeechActProvenance
                && (evidence.speechActActor === undefined
                    || evidence.mentionIdentityDigest === undefined
                    || evidence.promotionEligible === undefined)) {
                fail("suggestion evidence lacks obligation provenance");
            }
            const sourceKinds = [
                ...new Set(evidence.supportingSourceVariantRefDigests.map((ref) => {
                    const sourceKind = sourceKindByVariantRef.get(ref);
                    if (sourceKind === undefined) {
                        fail("candidate evidence references an unknown source variant");
                    }
                    return sourceKind;
                })),
            ].sort();
            const evidenceProofDigest = (0, source_contracts_js_1.taskMapContractDigest)({
                domain: CANDIDATE_EVIDENCE_PROOF_DOMAIN,
                statementReferenceDigest: evidence.statementReferenceDigest,
                evidenceDigest: evidence.evidenceDigest,
                canonicalMeetingDigest: (0, source_contracts_js_1.taskMapContractDigest)(evidence.canonicalMeetingId),
                kind: evidence.kind,
                occurredAt: evidence.occurredAt,
                observedAt: evidence.observedAt,
                authority: evidence.authority,
                quality: evidence.quality,
                coverage: evidence.coverage,
                confidence: evidence.confidence,
                status: evidence.status,
                deadline: evidence.deadline,
                objectRefDigests: evidence.objectRefs.map((ref) => (0, source_contracts_js_1.taskMapContractDigest)(ref)).sort(),
                supportingSourceVariantRefDigests: [...evidence.supportingSourceVariantRefDigests].sort(),
                sourceKinds,
                ...(hasSpeechActProvenance
                    ? {
                        proposalDisposition: evidence.proposalDisposition,
                        speechActClass: evidence.speechActClass,
                        speechActActor: evidence.speechActActor,
                        mentionIdentityDigest: evidence.mentionIdentityDigest,
                        extractionEnvelopeDigest: evidence.extractionEnvelopeDigest,
                        promotionEligible: evidence.promotionEligible,
                    }
                    : {}),
            });
            const occurrences = byStatement.get(evidence.statementReferenceDigest)
                ?? [];
            occurrences.push({
                evidence,
                evidenceProofDigest,
                sourceKinds,
            });
            byStatement.set(evidence.statementReferenceDigest, occurrences);
        }
    }
    const groups = [...byStatement.entries()].map(([statementReferenceDigest, occurrences]) => {
        const id = taskMapNativeCandidateId(snapshot.ownerScopeDigest, statementReferenceDigest);
        const evidenceProofDigests = [
            ...new Set(occurrences.map((item) => item.evidenceProofDigest)),
        ].sort();
        return {
            candidateId: id,
            statementReferenceDigest,
            candidateRevisionDigest: taskMapNativeCandidateRevisionDigest(id, evidenceProofDigests),
            evidenceProofDigests,
            occurrences: occurrences.sort((left, right) => compareCodePoints(left.evidence.occurredAt, right.evidence.occurredAt)
                || compareCodePoints(left.evidence.observedAt, right.evidence.observedAt)
                || compareCodePoints(left.evidence.evidenceDigest, right.evidence.evidenceDigest)),
        };
    }).sort((left, right) => compareCodePoints(left.candidateId, right.candidateId));
    if (groups.length
        > exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_LIMITS_V1.maxCandidates) {
        fail("candidate count exceeds its limit");
    }
    return groups;
}
function overlayBase(input) {
    const overlayDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: OVERLAY_DIGEST_DOMAIN,
        ...input,
    });
    const overlay = {
        ...input,
        overlayId: `tmnativecandidateoverlay_${overlayDigest}`,
        overlayDigest,
    };
    assertTaskMapNativeCandidateReview(overlay);
    return deepFreeze(overlay);
}
function assertCandidateProofRowsContext(input) {
    assertDigest(input.ownerScopeDigest, "proof rows owner scope");
    assertDigest(input.producerResultDigest, "proof rows result digest");
    assertDigest(input.producerSnapshotDigest, "proof rows snapshot digest");
    assertCanonicalTimestamp(input.producedAt, "proof rows producedAt");
    assertCanonicalTimestamp(input.assessedAt, "proof rows assessedAt");
    if (Date.parse(input.producedAt) > Date.parse(input.assessedAt)
        || !Array.isArray(input.candidates)
        || input.candidates.length > exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_LIMITS_V1.maxCandidates)
        fail("proof rows context is invalid");
    const seen = new Set();
    for (const row of input.candidates) {
        if (typeof row.candidateId !== "string"
            || !CANDIDATE_ID.test(row.candidateId)
            || seen.has(row.candidateId))
            fail("proof row candidate identity is invalid");
        seen.add(row.candidateId);
        assertDigest(row.statementReferenceDigest, "proof row statement reference");
        assertDigest(row.candidateRevisionDigest, "proof row revision");
        assertSortedUniqueDigests(row.evidenceProofDigests, "proof row evidence proofs");
        if (row.candidateId !== taskMapNativeCandidateId(input.ownerScopeDigest, row.statementReferenceDigest)
            || row.candidateRevisionDigest !== taskMapNativeCandidateRevisionDigest(row.candidateId, row.evidenceProofDigests))
            fail("proof row identity binding is invalid");
    }
}
/**
 * Reconciles review-only state for proof rows already derived by an
 * authenticated source adapter. It persists no display data and grants no
 * accepted-work authority.
 */
function buildTaskMapNativeCandidateReviewFromProofRows(input) {
    assertCandidateProofRowsContext(input.context);
    const previousReviews = new Map();
    if (input.previous !== null) {
        assertTaskMapNativeCandidateReview(input.previous);
        if (input.previous.ownerScopeDigest !== input.context.ownerScopeDigest) {
            fail("previous proof-row overlay owner scope does not match");
        }
        for (const row of input.previous.candidates) {
            previousReviews.set(row.candidateId, row.review);
        }
    }
    return overlayBase({
        contractVersion: exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_VERSION,
        policyVersion: exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_POLICY_VERSION,
        ownerScopeDigest: input.context.ownerScopeDigest,
        producerResultDigest: input.context.producerResultDigest,
        producerSnapshotDigest: input.context.producerSnapshotDigest,
        producedAt: input.context.producedAt,
        candidates: input.context.candidates.map((row) => ({
            candidateId: row.candidateId,
            statementReferenceDigest: row.statementReferenceDigest,
            candidateRevisionDigest: row.candidateRevisionDigest,
            evidenceProofDigests: [...row.evidenceProofDigests],
            review: previousReviews.get(row.candidateId) ?? null,
        })),
        privacy: PRIVACY,
    });
}
function reduceTaskMapNativeCandidateReviewFromProofRows(input) {
    assertDigest(input.expectedCandidateRevisionDigest, "expected proof-row revision");
    assertDigest(input.idempotencyKeyDigest, "proof-row idempotency key");
    assertReviewAction(input.action);
    const decidedAt = canonicalTimestamp(input.decidedAt, "proof-row decidedAt");
    if (Date.parse(decidedAt) > Date.parse(input.context.assessedAt)) {
        fail("proof-row decision time is outside the review interval");
    }
    const current = buildTaskMapNativeCandidateReviewFromProofRows({
        context: input.context,
        previous: input.overlay,
    });
    const rowIndex = current.candidates.findIndex((row) => row.candidateId === input.candidateId);
    if (rowIndex < 0)
        fail("candidate is not present in the proof rows");
    const row = current.candidates[rowIndex];
    if (row.candidateRevisionDigest !== input.expectedCandidateRevisionDigest) {
        fail("candidate revision is stale");
    }
    for (const candidate of current.candidates) {
        const review = candidate.review;
        if (review?.idempotencyKeyDigest !== input.idempotencyKeyDigest)
            continue;
        if (candidate.candidateId === row.candidateId
            && review.reviewedCandidateRevisionDigest === row.candidateRevisionDigest
            && review.action === input.action)
            return current;
        fail("idempotency key conflicts with another review decision");
    }
    const review = {
        decisionId: decisionId({
            ownerScopeDigest: current.ownerScopeDigest,
            candidateId: row.candidateId,
            candidateRevisionDigest: row.candidateRevisionDigest,
            action: input.action,
            idempotencyKeyDigest: input.idempotencyKeyDigest,
        }),
        action: input.action,
        idempotencyKeyDigest: input.idempotencyKeyDigest,
        reviewedCandidateRevisionDigest: row.candidateRevisionDigest,
        decidedAt,
        reviewedOnly: true,
        acceptedWork: false,
    };
    return overlayBase({
        contractVersion: current.contractVersion,
        policyVersion: current.policyVersion,
        ownerScopeDigest: current.ownerScopeDigest,
        producerResultDigest: current.producerResultDigest,
        producerSnapshotDigest: current.producerSnapshotDigest,
        producedAt: current.producedAt,
        candidates: current.candidates.map((candidate, index) => index === rowIndex ? { ...candidate, review } : candidate),
        privacy: PRIVACY,
    });
}
function applyTaskMapNativeCandidateReviewToProofRows(input) {
    const current = buildTaskMapNativeCandidateReviewFromProofRows({
        context: input.context,
        previous: input.overlay,
    });
    if (current.producerResultDigest !== input.context.producerResultDigest
        || current.producerSnapshotDigest !== input.context.producerSnapshotDigest)
        fail("proof-row overlay does not match current evidence");
    const reviews = new Map(current.candidates.map((row) => [row.candidateId, row]));
    return input.context.candidates.flatMap((row) => {
        const persisted = reviews.get(row.candidateId);
        const review = persisted?.review?.reviewedCandidateRevisionDigest
            === row.candidateRevisionDigest
            ? persisted.review
            : null;
        if (review?.action === "dismiss")
            return [];
        return [{
                ...row,
                reviewState: review?.action ?? "unreviewed",
                reviewedAt: review?.decidedAt ?? null,
                reviewedOnly: review !== null,
            }];
    });
}
function buildTaskMapNativeCandidateReview(input) {
    assertPlainObject(input, "build input");
    assertExactKeys(input, ["result", "previous", "expectedOwnerScopeDigest", "assessedAt"], "build input");
    assertDigest(input.expectedOwnerScopeDigest, "expectedOwnerScopeDigest");
    const { snapshot } = assertFreshResultAt(input.result, input.assessedAt);
    if (snapshot.ownerScopeDigest !== input.expectedOwnerScopeDigest) {
        fail("producer owner scope does not match the expected owner");
    }
    const previousReviews = new Map();
    if (input.previous !== null) {
        assertTaskMapNativeCandidateReview(input.previous);
        if (input.previous.ownerScopeDigest !== input.expectedOwnerScopeDigest) {
            fail("previous overlay owner scope does not match");
        }
        for (const row of input.previous.candidates) {
            previousReviews.set(row.candidateId, row.review);
        }
    }
    const candidates = buildCandidateGroups(input.result).map((group) => ({
        candidateId: group.candidateId,
        statementReferenceDigest: group.statementReferenceDigest,
        candidateRevisionDigest: group.candidateRevisionDigest,
        evidenceProofDigests: group.evidenceProofDigests,
        review: previousReviews.get(group.candidateId) ?? null,
    }));
    return overlayBase({
        contractVersion: exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_VERSION,
        policyVersion: exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_POLICY_VERSION,
        ownerScopeDigest: snapshot.ownerScopeDigest,
        producerResultDigest: input.result.resultDigest,
        producerSnapshotDigest: snapshot.snapshotDigest,
        producedAt: snapshot.producedAt,
        candidates,
        privacy: PRIVACY,
    });
}
function reduceTaskMapNativeCandidateReview(input) {
    assertPlainObject(input, "reduce input");
    assertExactKeys(input, [
        "result",
        "overlay",
        "expectedOwnerScopeDigest",
        "assessedAt",
        "candidateId",
        "expectedCandidateRevisionDigest",
        "action",
        "idempotencyKeyDigest",
        "decidedAt",
    ], "reduce input");
    assertDigest(input.expectedOwnerScopeDigest, "expectedOwnerScopeDigest");
    assertDigest(input.expectedCandidateRevisionDigest, "expectedCandidateRevisionDigest");
    assertDigest(input.idempotencyKeyDigest, "idempotencyKeyDigest");
    assertReviewAction(input.action);
    const assessedAt = canonicalTimestamp(input.assessedAt, "assessedAt");
    const decidedAt = canonicalTimestamp(input.decidedAt, "decidedAt");
    if (Date.parse(decidedAt) > Date.parse(assessedAt)
        || Date.parse(decidedAt)
            < Date.parse(input.result.freshness.assessedAt)) {
        fail("decision time is outside the authenticated review interval");
    }
    const current = buildTaskMapNativeCandidateReview({
        result: input.result,
        previous: input.overlay,
        expectedOwnerScopeDigest: input.expectedOwnerScopeDigest,
        assessedAt,
    });
    const rowIndex = current.candidates.findIndex((row) => row.candidateId === input.candidateId);
    if (rowIndex < 0)
        fail("candidate is not present in the fresh result");
    const row = current.candidates[rowIndex];
    if (row.candidateRevisionDigest
        !== input.expectedCandidateRevisionDigest) {
        fail("candidate revision is stale");
    }
    for (const candidate of current.candidates) {
        const review = candidate.review;
        if (review?.idempotencyKeyDigest !== input.idempotencyKeyDigest)
            continue;
        if (candidate.candidateId === row.candidateId
            && review.reviewedCandidateRevisionDigest
                === row.candidateRevisionDigest
            && review.action === input.action) {
            return current;
        }
        fail("idempotency key conflicts with another review decision");
    }
    const review = {
        decisionId: decisionId({
            ownerScopeDigest: current.ownerScopeDigest,
            candidateId: row.candidateId,
            candidateRevisionDigest: row.candidateRevisionDigest,
            action: input.action,
            idempotencyKeyDigest: input.idempotencyKeyDigest,
        }),
        action: input.action,
        idempotencyKeyDigest: input.idempotencyKeyDigest,
        reviewedCandidateRevisionDigest: row.candidateRevisionDigest,
        decidedAt,
        reviewedOnly: true,
        acceptedWork: false,
    };
    const candidates = current.candidates.map((candidate, index) => index === rowIndex ? { ...candidate, review } : candidate);
    return overlayBase({
        contractVersion: current.contractVersion,
        policyVersion: current.policyVersion,
        ownerScopeDigest: current.ownerScopeDigest,
        producerResultDigest: current.producerResultDigest,
        producerSnapshotDigest: current.producerSnapshotDigest,
        producedAt: current.producedAt,
        candidates,
        privacy: PRIVACY,
    });
}
/**
 * Owner-display view only. Titles and summaries are joined from the currently
 * authenticated fresh producer result and are never accepted by load/write.
 */
function buildTaskMapNativeCandidateShelf(result, overlay, assessedAtInput) {
    const { assessedAt, snapshot } = assertFreshResultAt(result, assessedAtInput);
    assertTaskMapNativeCandidateReview(overlay);
    if (overlay.ownerScopeDigest !== snapshot.ownerScopeDigest
        || overlay.producerResultDigest !== result.resultDigest
        || overlay.producerSnapshotDigest !== snapshot.snapshotDigest) {
        fail("candidate overlay does not match the fresh producer result");
    }
    const groups = buildCandidateGroups(result);
    if (groups.length !== overlay.candidates.length) {
        fail("candidate overlay does not cover the fresh candidate set");
    }
    const overlayRows = new Map(overlay.candidates.map((row) => [row.candidateId, row]));
    const candidates = groups.flatMap((group) => {
        const overlayRow = overlayRows.get(group.candidateId);
        if (overlayRow === undefined
            || overlayRow.statementReferenceDigest
                !== group.statementReferenceDigest
            || overlayRow.candidateRevisionDigest
                !== group.candidateRevisionDigest
            || (0, source_contracts_js_1.taskMapContractCanonicalJson)(overlayRow.evidenceProofDigests)
                !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(group.evidenceProofDigests)) {
            fail("candidate overlay proof does not match fresh evidence");
        }
        const first = group.occurrences[0].evidence;
        const sourceKinds = [
            ...new Set(group.occurrences.flatMap((item) => item.sourceKinds)),
        ].sort();
        const occurredAt = group.occurrences.reduce((earliest, item) => item.evidence.occurredAt < earliest
            ? item.evidence.occurredAt
            : earliest, first.occurredAt);
        const observedAt = group.occurrences.reduce((latest, item) => item.evidence.observedAt > latest
            ? item.evidence.observedAt
            : latest, first.observedAt);
        const currentReview = overlayRow.review?.reviewedCandidateRevisionDigest
            === group.candidateRevisionDigest
            ? overlayRow.review
            : null;
        if (currentReview?.action === "dismiss")
            return [];
        return [{
                candidateId: group.candidateId,
                candidateRevisionDigest: group.candidateRevisionDigest,
                statementReferenceDigest: group.statementReferenceDigest,
                evidenceProofDigests: group.evidenceProofDigests,
                kind: first.kind,
                title: first.title,
                summary: first.summary,
                ...(first.speechActClass === undefined
                    ? {}
                    : {
                        speechActClass: first.speechActClass,
                        speechActActor: first.speechActActor,
                        mentionIdentityDigest: first.mentionIdentityDigest,
                    }),
                confidence: first.confidence,
                promotionEligible: group.occurrences.every((item) => item.evidence.promotionEligible === true),
                sourceKinds,
                occurredAt,
                observedAt,
                reviewState: (currentReview?.action ?? "unreviewed"),
                reviewedAt: currentReview?.decidedAt ?? null,
                reviewedOnly: currentReview !== null,
                acceptedWork: false,
                rankEligible: false,
                routeEligible: false,
                proveEligible: false,
                runEligible: false,
            }];
    });
    return deepFreeze({
        contractVersion: exports.TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION,
        ownerScopeDigest: snapshot.ownerScopeDigest,
        producerResultDigest: result.resultDigest,
        producerSnapshotDigest: snapshot.snapshotDigest,
        assessedAt,
        candidates,
        displayTextPersistence: "memory_only",
    });
}
/**
 * Resolve one exact current proof from the authenticated shelf. The review
 * overlay is read-only and remains byte-for-byte unchanged. Task 6 accepts
 * only the Google producer result authenticated by the existing overlay;
 * other producer unions require Task 7's extraction-report validator.
 */
function resolveTaskMapNativeCandidateProof(input) {
    assertPlainObject(input, "candidate proof resolver input");
    assertExactKeys(input, [
        "result",
        "overlay",
        "expectedOwnerScopeDigest",
        "assessedAt",
        "candidateId",
    ], "candidate proof resolver input");
    assertDigest(input.expectedOwnerScopeDigest, "expectedOwnerScopeDigest");
    if (!CANDIDATE_ID.test(input.candidateId)) {
        fail("candidate ID is invalid");
    }
    const shelf = buildTaskMapNativeCandidateShelf(input.result, input.overlay, input.assessedAt);
    if (shelf.ownerScopeDigest !== input.expectedOwnerScopeDigest) {
        fail("candidate proof owner does not match");
    }
    const matching = shelf.candidates.find((row) => row.candidateId === input.candidateId);
    if (matching === undefined) {
        fail("candidate is not present in the current shelf");
    }
    return matching;
}
const NATIVE_SHELF_UNSAFE_TEXT = [
    /\b(?:https?|ftp):\/\//i,
    /\bfile:\/\//i,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/i,
    /(?:^|[\s("'`])(?:~\/|\/(?:Users|home|private|var|tmp|Volumes|Applications|Library|opt|etc)\/|[A-Za-z]:[\\/]|\\\\)/,
    /(?:^|[\s("'`:=])\/(?!\/)(?!(?:quit|exit)(?:\(\))?(?=$|[\s.,;:!?]))[^\s<>"')\],;]+/,
    /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|secret|token)\s*[:=]/i,
];
function assertNativeShelfBoundedText(value, maximum, label) {
    if (typeof value !== "string"
        || value.length === 0
        || value.length > maximum
        || CONTROL_CHARACTER.test(value))
        fail(`${label} is not privacy-bounded`);
}
function assertNativeShelfAgentText(value, maximum, label) {
    assertNativeShelfBoundedText(value, maximum, label);
    if (NATIVE_SHELF_UNSAFE_TEXT.some((pattern) => pattern.test(value))) {
        fail(`${label} is not privacy-bounded`);
    }
}
function assertNativeShelfReviewTruth(row, label) {
    if (row.reviewState !== "unreviewed"
        && row.reviewState !== "accept_for_review"
        && row.reviewState !== "dismiss"
        && row.reviewState !== "defer")
        fail(`${label}.reviewState is invalid`);
    if (row.reviewState === "unreviewed") {
        if (row.reviewedOnly !== false || row.reviewedAt !== null) {
            fail(`${label} has inconsistent unreviewed state`);
        }
    }
    else {
        if (row.reviewedOnly !== true)
            fail(`${label} is not review-only`);
        assertCanonicalTimestamp(row.reviewedAt, `${label}.reviewedAt`);
    }
}
/** Strict validator for the ephemeral v2 meeting/agent display union. */
function assertTaskMapNativeCandidateShelfV2(value) {
    assertPlainObject(value, "candidate shelf v2");
    assertExactKeys(value, [
        "assessedAt",
        "candidates",
        "contractVersion",
        "displayTextPersistence",
        "ownerScopeDigest",
        "producerResultDigest",
        "producerSnapshotDigest",
    ], "candidate shelf v2");
    if (value.contractVersion !== exports.TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION_V2
        || value.displayTextPersistence !== "memory_only")
        fail("candidate shelf v2 contract is invalid");
    assertDigest(value.ownerScopeDigest, "candidate shelf v2 owner");
    assertDigest(value.producerResultDigest, "candidate shelf v2 result");
    assertDigest(value.producerSnapshotDigest, "candidate shelf v2 snapshot");
    assertCanonicalTimestamp(value.assessedAt, "candidate shelf v2 assessedAt");
    if (!Array.isArray(value.candidates)
        || value.candidates.length
            > exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_LIMITS_V1.maxCandidates)
        fail("candidate shelf v2 candidates exceed their bound");
    let priorId;
    for (const [index, candidate] of value.candidates.entries()) {
        const label = `candidate shelf v2 candidates[${index}]`;
        assertPlainObject(candidate, label);
        if (typeof candidate.candidateId !== "string"
            || !CANDIDATE_ID.test(candidate.candidateId)
            || (priorId !== undefined && priorId >= candidate.candidateId))
            fail("candidate shelf v2 identities are not canonical");
        priorId = candidate.candidateId;
        assertDigest(candidate.statementReferenceDigest, `${label}.statementReferenceDigest`);
        assertDigest(candidate.candidateRevisionDigest, `${label}.candidateRevisionDigest`);
        assertSortedUniqueDigests(candidate.evidenceProofDigests, `${label}.evidenceProofDigests`);
        if (candidate.candidateId !== taskMapNativeCandidateId(value.ownerScopeDigest, candidate.statementReferenceDigest)
            || candidate.candidateRevisionDigest !== taskMapNativeCandidateRevisionDigest(candidate.candidateId, candidate.evidenceProofDigests))
            fail(`${label} proof identity is inconsistent`);
        assertNativeShelfReviewTruth(candidate, label);
        assertNativeShelfBoundedText(candidate.title, exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_LIMITS_V1.maxTitleCharacters, `${label}.title`);
        assertNativeShelfBoundedText(candidate.summary, exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_LIMITS_V1.maxSummaryCharacters, `${label}.summary`);
        assertCanonicalTimestamp(candidate.occurredAt, `${label}.occurredAt`);
        assertCanonicalTimestamp(candidate.observedAt, `${label}.observedAt`);
        if (Date.parse(candidate.occurredAt) > Date.parse(candidate.observedAt)) {
            fail(`${label} timestamps are inconsistent`);
        }
        if (candidate.candidateFamily === "agent_session") {
            assertExactKeys(candidate, [
                "acceptedWork", "candidateFamily", "candidateId",
                "candidateRevisionDigest", "confidence", "evidenceProofDigests", "kind",
                "mentionIdentityDigest", "observedAt", "occurredAt", "originIdentityDigest",
                "promotionEligible", "proposalDisposition", "proveEligible",
                "rankEligible", "reviewState", "reviewedAt", "reviewedOnly",
                "routeEligible", "runEligible", "sourceKinds", "speechActActor",
                "speechActClass",
                "sourceWritebackEligible", "statementReferenceDigest", "summary",
                "supportSetRevisionDigest", "title", "workstreamIdentityDigest",
            ], label);
            assertNativeShelfAgentText(candidate.title, exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_LIMITS_V1.maxTitleCharacters, `${label}.title`);
            assertNativeShelfAgentText(candidate.summary, exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_LIMITS_V1.maxSummaryCharacters, `${label}.summary`);
            assertDigest(candidate.originIdentityDigest, `${label}.originIdentityDigest`);
            assertDigest(candidate.workstreamIdentityDigest, `${label}.workstreamIdentityDigest`);
            assertDigest(candidate.mentionIdentityDigest, `${label}.mentionIdentityDigest`);
            if (candidate.speechActClass !== "request"
                && candidate.speechActClass !== "commitment"
                && candidate.speechActClass !== "decision"
                && candidate.speechActClass !== "other")
                fail(`${label}.speechActClass is invalid`);
            if (candidate.speechActActor !== "self"
                && candidate.speechActActor !== "other"
                && candidate.speechActActor !== "unknown")
                fail(`${label}.speechActActor is invalid`);
            if (typeof candidate.confidence !== "number"
                || !Number.isFinite(candidate.confidence)
                || candidate.confidence < 0
                || candidate.confidence > 1)
                fail(`${label}.confidence is invalid`);
            if (candidate.statementReferenceDigest
                !== taskMapAgentSessionCandidateStatementReferenceDigest(value.ownerScopeDigest, candidate.originIdentityDigest, candidate.mentionIdentityDigest)) {
                fail(`${label} statement is not bound to its owner and mention identity`);
            }
            const sourceKinds = candidate.sourceKinds;
            if (!Array.isArray(sourceKinds)) {
                fail(`${label} has mixed or invalid agent source proof`);
            }
            const expectedKind = candidate.speechActClass === "commitment" ? "commitment"
                : candidate.speechActClass === "decision" ? "decision"
                    : "action_item";
            const gate = (0, meeting_producer_freshness_js_1.taskMapMeetingObligationGate)(candidate.speechActClass, candidate.speechActActor);
            if (candidate.kind !== expectedKind
                || candidate.supportSetRevisionDigest !== candidate.candidateRevisionDigest
                || candidate.proposalDisposition !== gate.proposalDisposition
                || typeof candidate.promotionEligible !== "boolean"
                || (candidate.promotionEligible && !gate.promotionEligible)
                || candidate.acceptedWork !== false
                || candidate.sourceWritebackEligible !== false
                || candidate.rankEligible !== false
                || candidate.routeEligible !== false
                || candidate.proveEligible !== false
                || candidate.runEligible !== false
                || sourceKinds.length === 0
                || sourceKinds.length > 2
                || sourceKinds.some((kind) => kind !== "claude_session" && kind !== "codex_session")
                || sourceKinds.some((kind, sourceIndex) => sourceIndex > 0 && sourceKinds[sourceIndex - 1] >= kind))
                fail(`${label} has mixed or invalid agent source proof`);
        }
        else if (candidate.candidateFamily === "calendar") {
            assertExactKeys(candidate, [
                "acceptedWork", "candidateFamily", "candidateId",
                "candidateRevisionDigest", "confidence", "evidenceProofDigests",
                "kind", "mentionIdentityDigest", "observedAt", "occurredAt",
                "originIdentityDigest", "promotionEligible", "proposalDisposition",
                "proveEligible", "rankEligible", "reviewState", "reviewedAt",
                "reviewedOnly", "routeEligible", "runEligible", "sourceKinds",
                "sourceWritebackEligible", "speechActActor", "speechActClass",
                "statementReferenceDigest", "summary", "supportSetRevisionDigest",
                "title",
            ], label);
            assertDigest(candidate.originIdentityDigest, `${label}.originIdentityDigest`);
            assertDigest(candidate.mentionIdentityDigest, `${label}.mentionIdentityDigest`);
            if (candidate.originIdentityDigest !== candidate.mentionIdentityDigest
                || candidate.statementReferenceDigest
                    !== taskMapCalendarCandidateStatementReferenceDigest(value.ownerScopeDigest, candidate.mentionIdentityDigest))
                fail(`${label} statement is not bound to its owner and mention identity`);
            if (candidate.speechActClass !== "request"
                && candidate.speechActClass !== "commitment"
                && candidate.speechActClass !== "decision"
                && candidate.speechActClass !== "other")
                fail(`${label}.speechActClass is invalid`);
            if (candidate.speechActActor !== "self"
                && candidate.speechActActor !== "other"
                && candidate.speechActActor !== "unknown")
                fail(`${label}.speechActActor is invalid`);
            if (typeof candidate.confidence !== "number"
                || !Number.isFinite(candidate.confidence)
                || candidate.confidence < 0
                || candidate.confidence > 1)
                fail(`${label}.confidence is invalid`);
            const expectedKind = candidate.speechActClass === "commitment" ? "commitment"
                : candidate.speechActClass === "decision" ? "decision"
                    : "action_item";
            const gate = (0, meeting_producer_freshness_js_1.taskMapMeetingObligationGate)(candidate.speechActClass, candidate.speechActActor);
            const sourceKinds = candidate.sourceKinds;
            if (candidate.kind !== expectedKind
                || candidate.supportSetRevisionDigest !== candidate.candidateRevisionDigest
                || candidate.proposalDisposition !== gate.proposalDisposition
                || typeof candidate.promotionEligible !== "boolean"
                || (candidate.promotionEligible && !gate.promotionEligible)
                || candidate.acceptedWork !== false
                || candidate.sourceWritebackEligible !== false
                || candidate.rankEligible !== false
                || candidate.routeEligible !== false
                || candidate.proveEligible !== false
                || candidate.runEligible !== false
                || !Array.isArray(sourceKinds)
                || sourceKinds.length !== 1
                || sourceKinds[0] !== "calendar")
                fail(`${label} has mixed or invalid calendar source proof`);
        }
        else if (candidate.candidateFamily === "accepted_pending") {
            assertExactKeys(candidate, [
                "acceptedWork", "candidateFamily", "candidateId",
                "candidateRevisionDigest", "confidence", "evidenceProofDigests",
                "kind", "mentionIdentityDigest", "observedAt", "occurredAt",
                "promotionEligible", "proveEligible", "rankEligible", "reviewState",
                "reviewedAt", "reviewedOnly", "routeEligible", "runEligible",
                "sourceKinds", "sourceWritebackEligible", "speechActActor",
                "speechActClass", "statementReferenceDigest", "summary", "title",
            ], label);
            assertDigest(candidate.mentionIdentityDigest, `${label}.mentionIdentityDigest`);
            const expectedKind = candidate.speechActClass === "commitment"
                ? "commitment"
                : candidate.speechActClass === "decision" ? "decision" : "action_item";
            if ((candidate.speechActClass !== "request"
                && candidate.speechActClass !== "commitment"
                && candidate.speechActClass !== "decision"
                && candidate.speechActClass !== "other")
                || (candidate.speechActActor !== "self"
                    && candidate.speechActActor !== "other"
                    && candidate.speechActActor !== "unknown")
                || candidate.kind !== expectedKind
                || typeof candidate.confidence !== "number"
                || !Number.isFinite(candidate.confidence)
                || candidate.confidence < 0
                || candidate.confidence > 1
                || !Array.isArray(candidate.sourceKinds)
                || candidate.sourceKinds.length !== 1
                || candidate.sourceKinds[0] !== "accepted_pending"
                || candidate.reviewState !== "unreviewed"
                || candidate.reviewedAt !== null
                || candidate.reviewedOnly !== false
                || candidate.promotionEligible !== false
                || candidate.acceptedWork !== false
                || candidate.sourceWritebackEligible !== false
                || candidate.rankEligible !== false
                || candidate.routeEligible !== false
                || candidate.proveEligible !== false
                || candidate.runEligible !== false)
                fail(`${label} has invalid receipt-backed pending proof`);
        }
        else if (candidate.candidateFamily === "meeting") {
            const required = [
                "acceptedWork", "candidateFamily", "candidateId",
                "candidateRevisionDigest", "confidence", "evidenceProofDigests",
                "kind", "observedAt", "occurredAt", "promotionEligible",
                "proveEligible", "rankEligible", "reviewState", "reviewedAt",
                "reviewedOnly", "routeEligible", "runEligible", "sourceKinds",
                "statementReferenceDigest", "summary", "title",
            ];
            const optional = ["mentionIdentityDigest", "speechActActor", "speechActClass"];
            const keys = Object.keys(candidate);
            const sourceKinds = candidate.sourceKinds;
            const hasSpeechProvenance = optional.some((key) => keys.includes(key));
            if (required.some((key) => !keys.includes(key))
                || keys.some((key) => !required.includes(key) && !optional.includes(key))
                || (hasSpeechProvenance && optional.some((key) => !keys.includes(key)))
                || (candidate.kind !== "decision"
                    && candidate.kind !== "action_item"
                    && candidate.kind !== "commitment")
                || typeof candidate.confidence !== "number"
                || !Number.isFinite(candidate.confidence)
                || candidate.confidence < 0
                || candidate.confidence > 1
                || typeof candidate.promotionEligible !== "boolean"
                || candidate.acceptedWork !== false
                || candidate.rankEligible !== false
                || candidate.routeEligible !== false
                || candidate.proveEligible !== false
                || candidate.runEligible !== false
                || !Array.isArray(sourceKinds)
                || sourceKinds.length === 0
                || sourceKinds.length > 2
                || sourceKinds.some((kind) => kind !== "gemini_meet" && kind !== "granola")
                || sourceKinds.some((kind, sourceIndex) => sourceIndex > 0 && sourceKinds[sourceIndex - 1] >= kind))
                fail(`${label} has mixed or invalid meeting source proof`);
            if (hasSpeechProvenance) {
                if (candidate.speechActClass !== "request"
                    && candidate.speechActClass !== "commitment"
                    && candidate.speechActClass !== "decision"
                    && candidate.speechActClass !== "other")
                    fail(`${label}.speechActClass is invalid`);
                if (candidate.speechActActor !== "self"
                    && candidate.speechActActor !== "other"
                    && candidate.speechActActor !== "unknown")
                    fail(`${label}.speechActActor is invalid`);
                assertDigest(candidate.mentionIdentityDigest, `${label}.mentionIdentityDigest`);
                const expectedKind = candidate.speechActClass === "commitment" ? "commitment"
                    : candidate.speechActClass === "decision" ? "decision"
                        : "action_item";
                if (candidate.kind !== expectedKind) {
                    fail(`${label} speech provenance and kind are inconsistent`);
                }
            }
        }
        else {
            fail(`${label}.candidateFamily is invalid`);
        }
    }
}
function assertTaskMapNativeCandidateShelfV3(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        fail("candidate shelf v3 is invalid");
    }
    const shelf = value;
    assertExactKeys(shelf, [
        "assessedAt", "candidates", "contractVersion", "displayTextPersistence",
        "durableConfirmedCandidateIds", "hierarchy", "ownerScopeDigest", "producerResultDigest",
        "producerSnapshotDigest",
    ], "candidate shelf v3");
    if (shelf.contractVersion !== exports.TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION_V3) {
        fail("candidate shelf v3 contract is invalid");
    }
    const durableConfirmedCandidateIds = shelf.durableConfirmedCandidateIds;
    if (!Array.isArray(durableConfirmedCandidateIds)
        || durableConfirmedCandidateIds.some((candidateId, index) => typeof candidateId !== "string"
            || !CANDIDATE_ID.test(candidateId)
            || (index > 0 && durableConfirmedCandidateIds[index - 1] >= candidateId)
            || !Array.isArray(shelf.candidates)
            || !shelf.candidates.some((candidate) => candidate !== null
                && typeof candidate === "object"
                && candidate.candidateId === candidateId)))
        fail("candidate shelf v3 durable confirmations are invalid");
    const { hierarchy, durableConfirmedCandidateIds: _durableConfirmedCandidateIds, ...shelfWithoutHierarchy } = shelf;
    const v2 = {
        ...shelfWithoutHierarchy,
        contractVersion: exports.TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION_V2,
    };
    assertTaskMapNativeCandidateShelfV2(v2);
    (0, native_candidate_hierarchy_js_1.assertTaskMapNativeCandidateHierarchy)(hierarchy, v2.producerSnapshotDigest, v2.candidates.map((candidate) => candidate.candidateId));
}
function assertTaskMapNativeCandidateReview(value) {
    assertPlainObject(value, "candidate review overlay");
    assertExactKeys(value, [
        "contractVersion",
        "policyVersion",
        "overlayId",
        "overlayDigest",
        "ownerScopeDigest",
        "producerResultDigest",
        "producerSnapshotDigest",
        "producedAt",
        "candidates",
        "privacy",
    ], "candidate review overlay");
    if (value.contractVersion !== exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_VERSION
        || value.policyVersion
            !== exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_POLICY_VERSION
        || typeof value.overlayId !== "string"
        || !OVERLAY_ID.test(value.overlayId)) {
        fail("candidate review version or overlay ID is invalid");
    }
    assertDigest(value.overlayDigest, "overlayDigest");
    assertDigest(value.ownerScopeDigest, "ownerScopeDigest");
    assertDigest(value.producerResultDigest, "producerResultDigest");
    assertDigest(value.producerSnapshotDigest, "producerSnapshotDigest");
    assertCanonicalTimestamp(value.producedAt, "producedAt");
    if (!Array.isArray(value.candidates)
        || value.candidates.length
            > exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_LIMITS_V1.maxCandidates) {
        fail("candidate rows exceed their limit");
    }
    let priorCandidateId;
    const idempotencyKeys = new Set();
    for (const [index, candidate] of value.candidates.entries()) {
        assertPlainObject(candidate, `candidates[${index}]`);
        assertExactKeys(candidate, [
            "candidateId",
            "statementReferenceDigest",
            "candidateRevisionDigest",
            "evidenceProofDigests",
            "review",
        ], `candidates[${index}]`);
        if (typeof candidate.candidateId !== "string"
            || !CANDIDATE_ID.test(candidate.candidateId)) {
            fail(`candidates[${index}].candidateId is invalid`);
        }
        if (priorCandidateId !== undefined
            && priorCandidateId >= candidate.candidateId) {
            fail("candidate rows must be sorted and unique");
        }
        priorCandidateId = candidate.candidateId;
        assertDigest(candidate.statementReferenceDigest, `candidates[${index}].statementReferenceDigest`);
        assertDigest(candidate.candidateRevisionDigest, `candidates[${index}].candidateRevisionDigest`);
        assertSortedUniqueDigests(candidate.evidenceProofDigests, `candidates[${index}].evidenceProofDigests`);
        if (candidate.candidateId !== taskMapNativeCandidateId(value.ownerScopeDigest, candidate.statementReferenceDigest)
            || candidate.candidateRevisionDigest !== taskMapNativeCandidateRevisionDigest(candidate.candidateId, candidate.evidenceProofDigests)) {
            fail(`candidates[${index}] identity or revision is inconsistent`);
        }
        if (candidate.review !== null) {
            assertPlainObject(candidate.review, `candidates[${index}].review`);
            assertExactKeys(candidate.review, [
                "decisionId",
                "action",
                "idempotencyKeyDigest",
                "reviewedCandidateRevisionDigest",
                "decidedAt",
                "reviewedOnly",
                "acceptedWork",
            ], `candidates[${index}].review`);
            if (typeof candidate.review.decisionId !== "string"
                || !DECISION_ID.test(candidate.review.decisionId)) {
                fail(`candidates[${index}].review.decisionId is invalid`);
            }
            assertReviewAction(candidate.review.action);
            assertDigest(candidate.review.idempotencyKeyDigest, `candidates[${index}].review.idempotencyKeyDigest`);
            assertDigest(candidate.review.reviewedCandidateRevisionDigest, `candidates[${index}].review.reviewedCandidateRevisionDigest`);
            assertCanonicalTimestamp(candidate.review.decidedAt, `candidates[${index}].review.decidedAt`);
            if (candidate.review.reviewedOnly !== true
                || candidate.review.acceptedWork !== false
                || candidate.review.decisionId !== decisionId({
                    ownerScopeDigest: value.ownerScopeDigest,
                    candidateId: candidate.candidateId,
                    candidateRevisionDigest: candidate.review.reviewedCandidateRevisionDigest,
                    action: candidate.review.action,
                    idempotencyKeyDigest: candidate.review.idempotencyKeyDigest,
                })) {
                fail(`candidates[${index}].review is inconsistent`);
            }
            if (idempotencyKeys.has(candidate.review.idempotencyKeyDigest)) {
                fail("review idempotency keys must be globally unique");
            }
            idempotencyKeys.add(candidate.review.idempotencyKeyDigest);
        }
    }
    assertPlainObject(value.privacy, "privacy");
    assertExactKeys(value.privacy, Object.keys(PRIVACY), "privacy");
    for (const [key, expected] of Object.entries(PRIVACY)) {
        if (value.privacy[key] !== expected) {
            fail(`privacy.${key} is invalid`);
        }
    }
    const { overlayId, overlayDigest, ...base } = value;
    const expectedDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: OVERLAY_DIGEST_DOMAIN,
        ...base,
    });
    if (overlayDigest !== expectedDigest
        || overlayId !== `tmnativecandidateoverlay_${expectedDigest}`) {
        fail("candidate review overlay digest is inconsistent");
    }
    const bytes = (0, source_contracts_js_1.taskMapContractCanonicalJson)(value);
    if (Buffer.byteLength(bytes, "utf8")
        > exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_LIMITS_V1.maxFileBytes) {
        fail("candidate review overlay exceeds its byte limit");
    }
}
function taskMapNativeCandidateReviewCanonicalBytes(value) {
    assertTaskMapNativeCandidateReview(value);
    return (0, source_contracts_js_1.taskMapContractCanonicalJson)(value);
}
function assertOverlayPath(overlayPath) {
    if (typeof overlayPath !== "string"
        || !node_path_1.default.isAbsolute(overlayPath)
        || node_path_1.default.normalize(overlayPath) !== overlayPath
        || CONTROL_CHARACTER.test(overlayPath)
        || Buffer.byteLength(overlayPath, "utf8") > 4096) {
        fail("overlayPath must be a normalized absolute path");
    }
}
function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
async function processStartMarker(pid) {
    if (!Number.isSafeInteger(pid) || pid <= 0)
        return null;
    return new Promise((resolve) => {
        try {
            (0, node_child_process_1.execFile)("/bin/ps", ["-o", "lstart=", "-p", String(pid)], {
                timeout: 1_000,
                maxBuffer: 4 * 1_024,
                env: { ...process.env, LC_ALL: "C", LANG: "C" },
            }, (error, stdout) => {
                if (error !== null) {
                    resolve(null);
                    return;
                }
                const marker = stdout.trim().replace(/\s+/g, " ");
                resolve(marker.length > 0 && marker.length <= 256 ? marker : null);
            });
        }
        catch {
            // Restricted local runtimes can deny spawning `ps`. PID liveness remains
            // authoritative; only the optional PID-reuse marker is unavailable.
            resolve(null);
        }
    });
}
async function processLockOwnerIsCurrent(pid, expectedStartMarker) {
    try {
        process.kill(pid, 0);
    }
    catch (error) {
        if (errnoCode(error) !== "EPERM")
            return false;
    }
    if (expectedStartMarker === null)
        return true;
    const actualStartMarker = await processStartMarker(pid);
    return actualStartMarker === null || actualStartMarker === expectedStartMarker;
}
function transactionLockPaths(overlayPath, token) {
    const lockPath = `${overlayPath}.lock`;
    assertOverlayPath(lockPath);
    if (token === undefined)
        return { lockPath, peerPath: null };
    if (!TRANSACTION_LOCK_TOKEN.test(token)) {
        fail("transaction lock token is invalid");
    }
    const peerPath = `${lockPath}.${token}.owner`;
    assertOverlayPath(peerPath);
    return { lockPath, peerPath };
}
function assertTransactionLockReceipt(value) {
    assertPlainObject(value, "transaction lock receipt");
    assertExactKeys(value, [
        "contractVersion",
        "ownerScopeDigest",
        "pid",
        "processStartMarker",
        "createdAtMs",
        "token",
    ], "transaction lock receipt");
    if (value.contractVersion !== TRANSACTION_LOCK_VERSION) {
        fail("transaction lock version is invalid");
    }
    assertDigest(value.ownerScopeDigest, "transaction lock ownerScopeDigest");
    if (!Number.isSafeInteger(value.pid) || value.pid <= 0) {
        fail("transaction lock pid is invalid");
    }
    if (value.processStartMarker !== null
        && (typeof value.processStartMarker !== "string"
            || value.processStartMarker.length === 0
            || value.processStartMarker.length > 256
            || CONTROL_CHARACTER.test(value.processStartMarker))) {
        fail("transaction lock process marker is invalid");
    }
    if (!Number.isSafeInteger(value.createdAtMs)
        || value.createdAtMs <= 0) {
        fail("transaction lock creation time is invalid");
    }
    if (typeof value.token !== "string"
        || !TRANSACTION_LOCK_TOKEN.test(value.token)) {
        fail("transaction lock token is invalid");
    }
}
async function syncDirectory(directory) {
    const handle = await (0, promises_1.open)(directory, node_fs_1.constants.O_RDONLY);
    await handle.sync().finally(() => handle.close());
}
async function readAuthenticatedTransactionLock(lockPath) {
    let handle;
    try {
        handle = await (0, promises_1.open)(lockPath, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_NOFOLLOW);
        const before = await handle.stat({ bigint: true });
        const currentUid = typeof process.getuid === "function"
            ? BigInt(process.getuid())
            : before.uid;
        if (!before.isFile()
            || before.uid !== currentUid
            || Number(before.mode & 511n) !== FILE_MODE
            || before.nlink !== 2n
            || before.size < 2n
            || before.size > BigInt(TRANSACTION_LOCK_MAX_BYTES)) {
            fail("transaction lock authentication failed");
        }
        const buffer = await handle.readFile();
        const after = await handle.stat({ bigint: true });
        if (after.dev !== before.dev
            || after.ino !== before.ino
            || after.size !== before.size
            || after.mtimeNs !== before.mtimeNs) {
            fail("transaction lock changed during read");
        }
        const bytes = buffer.toString("utf8");
        let parsed;
        try {
            parsed = JSON.parse(bytes);
        }
        catch {
            fail("transaction lock bytes are invalid");
        }
        assertTransactionLockReceipt(parsed);
        if ((0, source_contracts_js_1.taskMapContractCanonicalJson)(parsed) !== bytes) {
            fail("transaction lock bytes are noncanonical");
        }
        const { peerPath } = transactionLockPaths(lockPath.slice(0, -5), parsed.token);
        if (peerPath === null)
            fail("transaction lock peer is unavailable");
        const [lockStats, peerStats] = await Promise.all([
            (0, promises_1.lstat)(lockPath, { bigint: true }),
            (0, promises_1.lstat)(peerPath, { bigint: true }),
        ]);
        if (lockStats.dev !== before.dev
            || lockStats.ino !== before.ino
            || peerStats.dev !== before.dev
            || peerStats.ino !== before.ino
            || !lockStats.isFile()
            || !peerStats.isFile()
            || lockStats.uid !== currentUid
            || peerStats.uid !== currentUid
            || Number(lockStats.mode & 511n) !== FILE_MODE
            || Number(peerStats.mode & 511n) !== FILE_MODE
            || lockStats.nlink !== 2n
            || peerStats.nlink !== 2n
            || lockStats.size !== before.size
            || peerStats.size !== before.size) {
            fail("transaction lock peer authentication failed");
        }
        return {
            receipt: parsed,
            bytes,
            dev: before.dev,
            ino: before.ino,
            peerPath,
        };
    }
    catch (error) {
        if (errnoCode(error) === "ENOENT")
            return null;
        throw error;
    }
    finally {
        await handle?.close().catch(() => undefined);
    }
}
async function unlinkAuthenticatedTransactionLock(lockPath, expected) {
    const current = await readAuthenticatedTransactionLock(lockPath);
    if (current === null
        || current.dev !== expected.dev
        || current.ino !== expected.ino
        || current.bytes !== expected.bytes
        || current.peerPath !== expected.peerPath) {
        fail("transaction lock ownership changed before cleanup");
    }
    await (0, promises_1.unlink)(lockPath);
    const peerStats = await (0, promises_1.lstat)(expected.peerPath, { bigint: true });
    const currentUid = typeof process.getuid === "function"
        ? BigInt(process.getuid())
        : peerStats.uid;
    if (peerStats.dev !== expected.dev
        || peerStats.ino !== expected.ino
        || !peerStats.isFile()
        || peerStats.uid !== currentUid
        || Number(peerStats.mode & 511n) !== FILE_MODE
        || peerStats.nlink !== 1n) {
        fail("transaction lock peer changed during cleanup");
    }
    await (0, promises_1.unlink)(expected.peerPath);
    await syncDirectory(node_path_1.default.dirname(lockPath));
}
async function reclaimDeadTransactionLock(lockPath) {
    const existing = await readAuthenticatedTransactionLock(lockPath);
    if (existing === null)
        return true;
    if (await processLockOwnerIsCurrent(existing.receipt.pid, existing.receipt.processStartMarker)) {
        return false;
    }
    const current = await readAuthenticatedTransactionLock(lockPath);
    if (current === null)
        return true;
    if (current.dev !== existing.dev
        || current.ino !== existing.ino
        || current.bytes !== existing.bytes
        || current.peerPath !== existing.peerPath) {
        return false;
    }
    if (await processLockOwnerIsCurrent(current.receipt.pid, current.receipt.processStartMarker)) {
        return false;
    }
    try {
        await unlinkAuthenticatedTransactionLock(lockPath, current);
    }
    catch (error) {
        try {
            await (0, promises_1.lstat)(lockPath);
        }
        catch (pathError) {
            if (errnoCode(pathError) === "ENOENT")
                return true;
            throw pathError;
        }
        throw error;
    }
    return true;
}
async function unlinkOwnedUnlinkedPeer(peerPath, expectedDev, expectedIno) {
    try {
        const stats = await (0, promises_1.lstat)(peerPath, { bigint: true });
        const currentUid = typeof process.getuid === "function"
            ? BigInt(process.getuid())
            : stats.uid;
        if (stats.dev !== expectedDev
            || stats.ino !== expectedIno
            || !stats.isFile()
            || stats.uid !== currentUid
            || Number(stats.mode & 511n) !== FILE_MODE
            || stats.nlink !== 1n) {
            fail("transaction lock peer changed before cleanup");
        }
        await (0, promises_1.unlink)(peerPath);
    }
    catch (error) {
        if (errnoCode(error) !== "ENOENT")
            throw error;
    }
}
/**
 * Serializes the complete owner-local overlay read/build/reduce/write
 * transaction across CLI processes. A canonical receipt is fully staged
 * before its no-replace hardlink becomes the lock. Dead owners are reclaimed
 * only after receipt, inode, peer, mode, and process-identity verification.
 */
async function withTaskMapNativeCandidateReviewTransaction(input, operation) {
    assertPlainObject(input, "transaction input");
    assertExactKeys(input, ["overlayPath", "expectedOwnerScopeDigest"], "transaction input");
    assertOverlayPath(input.overlayPath);
    assertDigest(input.expectedOwnerScopeDigest, "expectedOwnerScopeDigest");
    if (typeof operation !== "function") {
        fail("transaction operation is invalid");
    }
    const parentReceipt = await ensurePrivateParent(input.overlayPath);
    const token = (0, node_crypto_1.randomBytes)(16).toString("hex");
    const { lockPath, peerPath } = transactionLockPaths(input.overlayPath, token);
    if (peerPath === null)
        fail("transaction lock peer is unavailable");
    const receipt = {
        contractVersion: TRANSACTION_LOCK_VERSION,
        ownerScopeDigest: input.expectedOwnerScopeDigest,
        pid: process.pid,
        processStartMarker: await processStartMarker(process.pid),
        createdAtMs: Date.now(),
        token,
    };
    const bytes = (0, source_contracts_js_1.taskMapContractCanonicalJson)(receipt);
    let peerHandle;
    let peerDev = 0n;
    let peerIno = 0n;
    let linked = false;
    let ownedLock = null;
    try {
        peerHandle = await (0, promises_1.open)(peerPath, node_fs_1.constants.O_RDWR
            | node_fs_1.constants.O_CREAT
            | node_fs_1.constants.O_EXCL
            | node_fs_1.constants.O_NOFOLLOW, FILE_MODE);
        await peerHandle.writeFile(bytes, "utf8");
        await peerHandle.sync();
        const peerStats = await peerHandle.stat({ bigint: true });
        const currentUid = typeof process.getuid === "function"
            ? BigInt(process.getuid())
            : peerStats.uid;
        if (!peerStats.isFile()
            || peerStats.uid !== currentUid
            || Number(peerStats.mode & 511n) !== FILE_MODE
            || peerStats.nlink !== 1n
            || peerStats.size !== BigInt(Buffer.byteLength(bytes, "utf8"))) {
            fail("transaction lock peer staging failed");
        }
        peerDev = peerStats.dev;
        peerIno = peerStats.ino;
        const deadline = Date.now() + TRANSACTION_LOCK_WAIT_MS;
        while (!linked) {
            const parentNow = await (0, promises_1.lstat)(parentReceipt.parent, { bigint: true });
            if (parentNow.dev !== parentReceipt.dev
                || parentNow.ino !== parentReceipt.ino
                || Number(parentNow.mode & 511n) !== DIRECTORY_MODE) {
                fail("overlay parent changed while acquiring transaction lock");
            }
            try {
                await (0, promises_1.link)(peerPath, lockPath);
                linked = true;
            }
            catch (error) {
                if (errnoCode(error) !== "EEXIST")
                    throw error;
                if (await reclaimDeadTransactionLock(lockPath))
                    continue;
                if (Date.now() >= deadline) {
                    fail("transaction lock wait exceeded its limit");
                }
                await sleep(TRANSACTION_LOCK_POLL_MS);
            }
        }
        await syncDirectory(parentReceipt.parent);
        const acquiredLock = await readAuthenticatedTransactionLock(lockPath);
        if (acquiredLock === null
            || acquiredLock.dev !== peerDev
            || acquiredLock.ino !== peerIno
            || acquiredLock.bytes !== bytes
            || acquiredLock.peerPath !== peerPath
            || acquiredLock.receipt.ownerScopeDigest
                !== input.expectedOwnerScopeDigest) {
            fail("transaction lock acquisition could not be authenticated");
        }
        ownedLock = acquiredLock;
        return await operation();
    }
    finally {
        await peerHandle?.close().catch(() => undefined);
        if (linked) {
            if (ownedLock === null) {
                const current = await readAuthenticatedTransactionLock(lockPath);
                if (current !== null
                    && current.dev === peerDev
                    && current.ino === peerIno
                    && current.bytes === bytes
                    && current.peerPath === peerPath) {
                    ownedLock = current;
                }
            }
            if (ownedLock === null) {
                fail("transaction lock ownership changed before cleanup");
            }
            await unlinkAuthenticatedTransactionLock(lockPath, ownedLock);
        }
        else if (peerDev !== 0n && peerIno !== 0n) {
            await unlinkOwnedUnlinkedPeer(peerPath, peerDev, peerIno);
        }
    }
}
async function ensurePrivateParent(overlayPath) {
    const parent = node_path_1.default.dirname(overlayPath);
    try {
        await (0, promises_1.mkdir)(parent, { mode: DIRECTORY_MODE, recursive: false });
    }
    catch (error) {
        if (errnoCode(error) !== "EEXIST")
            throw error;
    }
    const stats = await (0, promises_1.lstat)(parent, { bigint: true });
    const currentUid = typeof process.getuid === "function"
        ? BigInt(process.getuid())
        : stats.uid;
    if (stats.isSymbolicLink()
        || !stats.isDirectory()
        || stats.uid !== currentUid
        || Number(stats.mode & 511n) !== DIRECTORY_MODE
        || await (0, promises_1.realpath)(parent) !== parent) {
        fail("overlay parent must be an owner-only real 0700 directory");
    }
    return { parent, dev: stats.dev, ino: stats.ino };
}
async function assertExistingTargetSafe(overlayPath) {
    try {
        const stats = await (0, promises_1.lstat)(overlayPath, { bigint: true });
        const currentUid = typeof process.getuid === "function"
            ? BigInt(process.getuid())
            : stats.uid;
        if (stats.isSymbolicLink()
            || !stats.isFile()
            || stats.uid !== currentUid
            || Number(stats.mode & 511n) !== FILE_MODE
            || stats.nlink !== 1n
            || stats.size < 2n
            || stats.size > BigInt(exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_LIMITS_V1.maxFileBytes)) {
            fail("existing overlay target is not an owner-only 0600 regular file");
        }
    }
    catch (error) {
        if (errnoCode(error) === "ENOENT")
            return;
        throw error;
    }
}
async function loadTaskMapNativeCandidateReview(input) {
    assertPlainObject(input, "load input");
    assertExactKeys(input, ["overlayPath", "expectedOwnerScopeDigest"], "load input");
    assertOverlayPath(input.overlayPath);
    assertDigest(input.expectedOwnerScopeDigest, "expectedOwnerScopeDigest");
    await ensurePrivateParent(input.overlayPath);
    let handle;
    try {
        handle = await (0, promises_1.open)(input.overlayPath, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_NOFOLLOW);
        const before = await handle.stat({ bigint: true });
        const currentUid = typeof process.getuid === "function"
            ? BigInt(process.getuid())
            : before.uid;
        if (!before.isFile()
            || before.uid !== currentUid
            || Number(before.mode & 511n) !== FILE_MODE
            || before.nlink !== 1n
            || before.size < 2n
            || before.size > BigInt(exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_LIMITS_V1.maxFileBytes)) {
            fail("overlay file authentication failed");
        }
        const bytes = await handle.readFile();
        const after = await handle.stat({ bigint: true });
        if (after.dev !== before.dev
            || after.ino !== before.ino
            || after.size !== before.size
            || after.mtimeNs !== before.mtimeNs) {
            fail("overlay file changed during read");
        }
        let parsed;
        try {
            parsed = JSON.parse(bytes.toString("utf8"));
        }
        catch {
            fail("overlay bytes are not valid JSON");
        }
        assertTaskMapNativeCandidateReview(parsed);
        if ((0, source_contracts_js_1.taskMapContractCanonicalJson)(parsed) !== bytes.toString("utf8")
            || parsed.ownerScopeDigest !== input.expectedOwnerScopeDigest) {
            fail("overlay bytes are noncanonical or belong to another owner");
        }
        return deepFreeze(parsed);
    }
    catch (error) {
        if (errnoCode(error) === "ENOENT")
            return null;
        throw error;
    }
    finally {
        await handle?.close().catch(() => undefined);
    }
}
async function writeTaskMapNativeCandidateReview(input) {
    assertPlainObject(input, "write input");
    assertExactKeys(input, ["overlayPath", "expectedOwnerScopeDigest", "overlay"], "write input");
    assertOverlayPath(input.overlayPath);
    assertDigest(input.expectedOwnerScopeDigest, "expectedOwnerScopeDigest");
    assertTaskMapNativeCandidateReview(input.overlay);
    if (input.overlay.ownerScopeDigest !== input.expectedOwnerScopeDigest) {
        fail("overlay owner scope does not match the expected owner");
    }
    const bytes = taskMapNativeCandidateReviewCanonicalBytes(input.overlay);
    const parentReceipt = await ensurePrivateParent(input.overlayPath);
    await assertExistingTargetSafe(input.overlayPath);
    const stagePath = node_path_1.default.join(parentReceipt.parent, `.candidate-review-${(0, node_crypto_1.randomBytes)(16).toString("hex")}.tmp`);
    let stageExists = false;
    let stageHandle;
    try {
        stageHandle = await (0, promises_1.open)(stagePath, node_fs_1.constants.O_WRONLY
            | node_fs_1.constants.O_CREAT
            | node_fs_1.constants.O_EXCL
            | node_fs_1.constants.O_NOFOLLOW, FILE_MODE);
        stageExists = true;
        await stageHandle.writeFile(bytes, "utf8");
        await stageHandle.sync();
        const stageStats = await stageHandle.stat({ bigint: true });
        if (!stageStats.isFile()
            || Number(stageStats.mode & 511n) !== FILE_MODE
            || stageStats.nlink !== 1n
            || stageStats.size !== BigInt(Buffer.byteLength(bytes, "utf8"))) {
            fail("staged overlay authentication failed");
        }
        await stageHandle.close();
        stageHandle = undefined;
        const parentNow = await (0, promises_1.lstat)(parentReceipt.parent, { bigint: true });
        if (parentNow.dev !== parentReceipt.dev
            || parentNow.ino !== parentReceipt.ino
            || Number(parentNow.mode & 511n) !== DIRECTORY_MODE) {
            fail("overlay parent changed during write");
        }
        await assertExistingTargetSafe(input.overlayPath);
        await (0, promises_1.rename)(stagePath, input.overlayPath);
        stageExists = false;
        const directoryHandle = await (0, promises_1.open)(parentReceipt.parent, node_fs_1.constants.O_RDONLY);
        await directoryHandle.sync().finally(() => directoryHandle.close());
        const loaded = await loadTaskMapNativeCandidateReview({
            overlayPath: input.overlayPath,
            expectedOwnerScopeDigest: input.expectedOwnerScopeDigest,
        });
        if (loaded === null
            || taskMapNativeCandidateReviewCanonicalBytes(loaded) !== bytes) {
            fail("overlay readback does not match staged bytes");
        }
    }
    finally {
        await stageHandle?.close().catch(() => undefined);
        if (stageExists) {
            await (0, promises_1.unlink)(stagePath).catch(() => undefined);
        }
    }
}
