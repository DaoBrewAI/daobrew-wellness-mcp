"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_AGENT_SESSION_CANDIDATE_EVIDENCE_DOMAIN = exports.TASKMAP_AGENT_SESSION_CANDIDATE_STATEMENT_DOMAIN = void 0;
exports.taskMapAgentSessionCandidateEvidenceProofDigest = taskMapAgentSessionCandidateEvidenceProofDigest;
exports.buildTaskMapAgentSessionCandidateShelf = buildTaskMapAgentSessionCandidateShelf;
exports.buildTaskMapAgentSessionCandidateReview = buildTaskMapAgentSessionCandidateReview;
const agent_session_producer_freshness_js_1 = require("./agent-session-producer-freshness.js");
const agent_session_semantic_admission_js_1 = require("./agent-session-semantic-admission.js");
const native_candidate_review_js_1 = require("./native-candidate-review.js");
const source_contracts_js_1 = require("./source-contracts.js");
const text_contract_js_1 = require("./text-contract.js");
var native_candidate_review_js_2 = require("./native-candidate-review.js");
Object.defineProperty(exports, "TASKMAP_AGENT_SESSION_CANDIDATE_STATEMENT_DOMAIN", { enumerable: true, get: function () { return native_candidate_review_js_2.TASKMAP_AGENT_SESSION_CANDIDATE_STATEMENT_DOMAIN; } });
exports.TASKMAP_AGENT_SESSION_CANDIDATE_EVIDENCE_DOMAIN = "taskmap-agent-session-candidate-evidence.3";
function fail(message) {
    throw new Error(`Task Map agent candidate adapter: ${message}`);
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
function assertCurrentAdmission(admission, expectedOwnerScopeDigest, assessedAtInput) {
    (0, agent_session_semantic_admission_js_1.assertTaskMapAgentSessionSemanticAdmission)(admission);
    if (admission.ownerScopeDigest !== expectedOwnerScopeDigest) {
        fail("admission belongs to another owner");
    }
    const assessedAt = canonicalAssessedAt(assessedAtInput);
    const produced = Date.parse(admission.producedAt);
    const assessed = Date.parse(assessedAt);
    if (assessed < produced
        || assessed >= produced + agent_session_producer_freshness_js_1.TASKMAP_AGENT_SESSION_PRODUCER_MAX_AGE_MS)
        fail("admission is stale at assessedAt");
    return assessedAt;
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
function taskMapAgentSessionCandidateEvidenceProofDigest(ownerScopeDigest, cluster, support, mentionIdentityDigest, envelopeDigest) {
    return (0, source_contracts_js_1.taskMapContractDigest)({
        domain: exports.TASKMAP_AGENT_SESSION_CANDIDATE_EVIDENCE_DOMAIN,
        ownerScopeDigest,
        clusterIdentityDigest: cluster.clusterIdentityDigest,
        workstreamIdentityDigest: cluster.workstreamIdentityDigest,
        supportIdentityDigest: support.supportIdentityDigest,
        provider: support.provider,
        mentionIdentityDigest,
        envelopeDigest,
    });
}
function evidenceProofs(ownerScopeDigest, cluster, mentionIdentityDigest, envelopeDigest) {
    return [...new Set(cluster.supports.map((support) => taskMapAgentSessionCandidateEvidenceProofDigest(ownerScopeDigest, cluster, support, mentionIdentityDigest, envelopeDigest)))].sort(compareCodePoints);
}
function deriveAgentCandidates(admission, extraction, expectedOwnerScopeDigest, assessedAtInput) {
    const assessedAt = assertCurrentAdmission(admission, expectedOwnerScopeDigest, assessedAtInput);
    if (extraction.ownerScopeDigest !== admission.ownerScopeDigest
        || extraction.admissionDigest !== admission.admissionDigest)
        fail("extraction does not match current admission");
    const rows = extraction.clusters.flatMap((extractedCluster) => {
        const cluster = admission.clusters.find((candidate) => candidate.clusterIdentityDigest === extractedCluster.clusterIdentityDigest
            && candidate.workstreamIdentityDigest
                === extractedCluster.workstreamIdentityDigest);
        if (cluster === undefined)
            fail("extraction cluster has no current admission");
        if (extractedCluster.status === "degraded")
            return [];
        if (extractedCluster.envelopeDigest === null) {
            fail("extracted cluster has no station envelope");
        }
        const envelopeDigest = extractedCluster.envelopeDigest;
        return extractedCluster.mentions.map((mention) => {
            const statementReferenceDigest = (0, native_candidate_review_js_1.taskMapAgentSessionCandidateStatementReferenceDigest)(admission.ownerScopeDigest, cluster.clusterIdentityDigest, mention.mentionIdentityDigest);
            const candidateId = (0, native_candidate_review_js_1.taskMapNativeCandidateId)(admission.ownerScopeDigest, statementReferenceDigest);
            const proofDigests = evidenceProofs(admission.ownerScopeDigest, cluster, mention.mentionIdentityDigest, envelopeDigest);
            const candidateRevisionDigest = (0, native_candidate_review_js_1.taskMapNativeCandidateRevisionDigest)(candidateId, proofDigests);
            const sourceKinds = [...new Set(cluster.supports.map((support) => support.provider === "codex" ? "codex_session"
                    : "claude_session"))].sort(compareCodePoints);
            return {
                candidateId,
                candidateRevisionDigest,
                statementReferenceDigest,
                evidenceProofDigests: proofDigests,
                candidateFamily: "agent_session",
                kind: mentionKind(mention),
                title: (0, text_contract_js_1.boundedUtf16)(mention.title, native_candidate_review_js_1.TASKMAP_NATIVE_CANDIDATE_REVIEW_LIMITS_V1.maxTitleCharacters),
                summary: (0, text_contract_js_1.boundedUtf16)(mention.text, native_candidate_review_js_1.TASKMAP_NATIVE_CANDIDATE_REVIEW_LIMITS_V1.maxSummaryCharacters),
                sourceKinds,
                speechActClass: mention.speechActClass,
                speechActActor: mention.speechActActor,
                confidence: mention.confidence,
                mentionIdentityDigest: mention.mentionIdentityDigest,
                originIdentityDigest: cluster.clusterIdentityDigest,
                supportSetRevisionDigest: candidateRevisionDigest,
                workstreamIdentityDigest: cluster.workstreamIdentityDigest,
                proposalDisposition: mention.proposalDisposition,
                occurredAt: cluster.occurredAt,
                observedAt: cluster.observedAt,
                reviewState: "unreviewed",
                reviewedAt: null,
                reviewedOnly: false,
                promotionEligible: mention.promotionEligible,
                acceptedWork: false,
                sourceWritebackEligible: false,
                rankEligible: false,
                routeEligible: false,
                proveEligible: false,
                runEligible: false,
            };
        });
    }).sort((left, right) => compareCodePoints(left.candidateId, right.candidateId));
    const context = {
        ownerScopeDigest: admission.ownerScopeDigest,
        producerResultDigest: extraction.reportDigest,
        producerSnapshotDigest: admission.sourceSnapshotDigest,
        producedAt: admission.producedAt,
        assessedAt,
        candidates: rows,
    };
    return { context, rows };
}
function mentionKind(mention) {
    return mention.speechActClass === "commitment" ? "commitment"
        : mention.speechActClass === "decision" ? "decision"
            : "action_item";
}
function shelfFromDerived(derived, overlay) {
    (0, native_candidate_review_js_1.assertTaskMapNativeCandidateReview)(overlay);
    if (overlay.ownerScopeDigest !== derived.context.ownerScopeDigest
        || overlay.producerResultDigest !== derived.context.producerResultDigest
        || overlay.producerSnapshotDigest !== derived.context.producerSnapshotDigest)
        fail("candidate overlay does not match current support evidence");
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
function buildTaskMapAgentSessionCandidateShelf(input) {
    assertExactKeys(input, [
        "admission",
        "assessedAt",
        "expectedOwnerScopeDigest",
        "extraction",
        "overlay",
    ], "candidate shelf input");
    const derived = deriveAgentCandidates(input.admission, input.extraction, input.expectedOwnerScopeDigest, input.assessedAt);
    return shelfFromDerived(derived, input.overlay);
}
function buildTaskMapAgentSessionCandidateReview(input) {
    assertExactKeys(input, [
        "admission",
        "assessedAt",
        "expectedOwnerScopeDigest",
        "extraction",
        "previous",
    ], "candidate review input");
    const derived = deriveAgentCandidates(input.admission, input.extraction, input.expectedOwnerScopeDigest, input.assessedAt);
    const overlay = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateReviewFromProofRows)({
        context: derived.context,
        previous: input.previous,
    });
    const shelf = shelfFromDerived(derived, overlay);
    return deepFreeze({ overlay, shelf });
}
