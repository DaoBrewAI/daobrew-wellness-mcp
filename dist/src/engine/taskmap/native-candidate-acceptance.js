"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1 = exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_POLICY_VERSION = exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_VERSION = void 0;
exports.assertTaskMapNativeCandidateAcceptanceStore = assertTaskMapNativeCandidateAcceptanceStore;
exports.promoteTaskMapNativeCandidate = promoteTaskMapNativeCandidate;
exports.promoteTaskMapAgentSessionCandidate = promoteTaskMapAgentSessionCandidate;
exports.promoteTaskMapCalendarCandidate = promoteTaskMapCalendarCandidate;
exports.promoteTaskMapVerifiedMeetingCandidate = promoteTaskMapVerifiedMeetingCandidate;
exports.taskMapNativeCandidateAcceptanceHeadDigest = taskMapNativeCandidateAcceptanceHeadDigest;
exports.filterTaskMapNativeCandidateShelfAgainstAcceptanceStore = filterTaskMapNativeCandidateShelfAgainstAcceptanceStore;
exports.taskMapNativeCandidateAcceptanceManualAuthorityRecords = taskMapNativeCandidateAcceptanceManualAuthorityRecords;
exports.mergeTaskMapNativeCandidateAcceptanceIntoSemanticInput = mergeTaskMapNativeCandidateAcceptanceIntoSemanticInput;
exports.loadTaskMapNativeCandidateAcceptanceStore = loadTaskMapNativeCandidateAcceptanceStore;
exports.writeTaskMapNativeCandidateAcceptanceStore = writeTaskMapNativeCandidateAcceptanceStore;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const agent_session_candidate_adapter_js_1 = require("./agent-session-candidate-adapter.js");
const calendar_candidate_adapter_js_1 = require("./calendar-candidate-adapter.js");
const native_candidate_review_js_1 = require("./native-candidate-review.js");
const meeting_refresh_llm_replay_js_1 = require("./meeting-refresh-llm-replay.js");
const mention_extraction_js_1 = require("./mention-extraction.js");
const text_contract_js_1 = require("./text-contract.js");
const source_contracts_js_1 = require("./source-contracts.js");
exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_VERSION = "taskmap-native-candidate-acceptance.v1";
exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_POLICY_VERSION = "taskmap-native-candidate-acceptance-policy.1";
exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1 = Object.freeze({
    maxReceipts: 128,
    maxEvidenceProofsPerReceipt: 128,
    maxFileBytes: 2 * 1_024 * 1_024,
    maxTitleCharacters: 96,
    maxSummaryCharacters: 200,
});
const PROMOTION_DIGEST_DOMAIN = "taskmap-native-candidate-promotion.1";
const EMPTY_HEAD_DIGEST_DOMAIN = "taskmap-native-candidate-promotion-empty-head.1";
const SHA256 = /^[a-f0-9]{64}$/;
const CANDIDATE_ID = /^tmnativecandidate_[a-f0-9]{64}$/;
const PROMOTION_ID = /^tmcandidatepromotion_[a-f0-9]{64}$/;
const STRICT_RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const PATH_CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const EMAIL_ADDRESS = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/i;
const HTTP_URL = /(?:^|[^A-Za-z0-9_])https?:\/\/[^\s]+/i;
const CREDENTIAL_ASSIGNMENT = /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|passwd|secret|client[_-]?secret)\s*[:=]\s*["']?[^\s"',;]{4,}/i;
const BEARER_SECRET = /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}(?=$|[\s,.;)])/i;
const PROVIDER_TOKEN = /(?:\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}\b|\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b|\bAKIA[0-9A-Z]{16}\b)/;
const JWT_SECRET = /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/;
const LOCAL_FILE_URI = /(?:^|[^A-Za-z0-9_])file:\/\/\/[^\s]+/i;
const OWNER_LOCAL_ABSOLUTE_PATH = /(?:^|[^A-Za-z0-9_:/\\])(?:\/[^\s]+|~\/[^\s]+|[A-Za-z]:[\\/][^\s]+|\\\\[^\\\s]+\\[^\s]+)/;
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const FIXED_AUTHORITY = Object.freeze({
    sourceKind: "manual",
    authority: "user",
    syncMode: "personal_fork",
    capabilities: ["read_task"],
    recordKind: "authoritative_task",
    lifecycle: "explicit_user_policy",
    sourceStatus: "open",
});
const PRIVACY = Object.freeze({
    boundedAcceptedDisplayTextStored: true,
    sourceBodiesStored: false,
    participantDetailsStored: false,
    rawUrlsStored: false,
    credentialsStored: false,
    localPathsStored: false,
    callerDisplayTextStored: false,
    sourceWritebackPerformed: false,
});
function fail(message) {
    throw new Error(`Task Map candidate acceptance: ${message}`);
}
function errnoCode(error) {
    return error !== null
        && typeof error === "object"
        && "code" in error
        && typeof error.code === "string"
        ? error.code
        : undefined;
}
function assertPlainObject(value, label) {
    if (value === null
        || typeof value !== "object"
        || Array.isArray(value)
        || (Object.getPrototypeOf(value) !== Object.prototype
            && Object.getPrototypeOf(value) !== null))
        fail(`${label} must be a plain object`);
}
function assertExactKeys(value, keys, label) {
    const expected = new Set(keys);
    const actual = Object.keys(value);
    if (actual.length !== expected.size
        || actual.some((key) => !expected.has(key))
        || keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key)))
        fail(`${label} has unsupported or missing fields`);
}
function assertDigest(value, label) {
    if (typeof value !== "string" || !SHA256.test(value)) {
        fail(`${label} must be a sha256 digest`);
    }
}
function canonicalTimestamp(value, label) {
    if (typeof value !== "string"
        || value.length > 64
        || !STRICT_RFC3339.test(value)
        || !Number.isFinite(Date.parse(value)))
        fail(`${label} must be an RFC3339 timestamp`);
    const canonical = new Date(Date.parse(value)).toISOString();
    if (canonical !== value)
        fail(`${label} must be canonical`);
    return canonical;
}
function assertBoundedText(value, maximum, label) {
    if (typeof value !== "string"
        || value.length === 0
        || value.length > maximum
        || (0, text_contract_js_1.toWellFormedText)(value) !== value)
        fail(`${label} exceeds its bounded text contract`);
    if (value !== value.trim().replace(/\s+/gu, " ")) {
        fail(`${label} must use canonical display whitespace`);
    }
    if (!(0, mention_extraction_js_1.isTaskMapMentionDisplayTextSafe)(value)) {
        fail(`${label} violates the canonical display-text safety contract`);
    }
    if (EMAIL_ADDRESS.test(value)
        || HTTP_URL.test(value)
        || CREDENTIAL_ASSIGNMENT.test(value)
        || BEARER_SECRET.test(value)
        || PROVIDER_TOKEN.test(value)
        || JWT_SECRET.test(value)
        || LOCAL_FILE_URI.test(value)
        || OWNER_LOCAL_ABSOLUTE_PATH.test(value))
        fail(`${label} violates the standalone privacy boundary`);
}
function assertSortedUniqueDigests(value, label) {
    if (!Array.isArray(value)
        || value.length === 0
        || value.length
            > exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1
                .maxEvidenceProofsPerReceipt)
        fail(`${label} exceeds its bounded proof contract`);
    let prior;
    for (const [index, item] of value.entries()) {
        assertDigest(item, `${label}[${index}]`);
        if (prior !== undefined && prior >= item) {
            fail(`${label} must be sorted and unique`);
        }
        prior = item;
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
function acceptedPayload(proof) {
    if (proof.speechActClass === undefined
        || proof.speechActActor === undefined
        || proof.mentionIdentityDigest === undefined)
        fail("candidate lacks authenticated speech-act provenance");
    return {
        kind: proof.kind,
        title: proof.title,
        summary: proof.summary,
        speechActClass: proof.speechActClass,
        speechActActor: proof.speechActActor,
        mentionIdentityDigest: proof.mentionIdentityDigest,
        confidence: proof.confidence,
        occurredAt: proof.occurredAt,
        observedAt: proof.observedAt,
    };
}
function receiptBase(input) {
    const promotionDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: PROMOTION_DIGEST_DOMAIN,
        ...input,
    });
    return deepFreeze({
        promotionId: `tmcandidatepromotion_${promotionDigest}`,
        promotionDigest,
        ...input,
    });
}
function assertAcceptedPayload(value) {
    assertPlainObject(value, "accepted payload");
    assertExactKeys(value, [
        "kind",
        "title",
        "summary",
        "speechActClass",
        "speechActActor",
        "mentionIdentityDigest",
        "confidence",
        "occurredAt",
        "observedAt",
    ], "accepted payload");
    if (!["decision", "action_item", "commitment"].includes(String(value.kind))) {
        fail("accepted payload kind is invalid");
    }
    assertBoundedText(value.title, exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1.maxTitleCharacters, "accepted title");
    assertBoundedText(value.summary, exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1.maxSummaryCharacters, "accepted summary");
    if (!["request", "commitment", "decision", "other"].includes(String(value.speechActClass))
        || !["self", "other", "unknown"].includes(String(value.speechActActor)))
        fail("accepted speech-act provenance is invalid");
    const expectedKind = value.speechActClass === "commitment"
        ? "commitment"
        : value.speechActClass === "decision"
            ? "decision"
            : "action_item";
    const promotionEligible = (value.speechActClass === "request"
        || value.speechActClass === "commitment") && value.speechActActor === "self";
    if (value.kind !== expectedKind || !promotionEligible) {
        fail("accepted speech-act payload is not promotion eligible");
    }
    assertDigest(value.mentionIdentityDigest, "accepted mention identity");
    if (typeof value.confidence !== "number"
        || !Number.isFinite(value.confidence)
        || value.confidence < 0
        || value.confidence > 1)
        fail("accepted confidence is invalid");
    const occurredAt = canonicalTimestamp(value.occurredAt, "accepted occurredAt");
    const observedAt = canonicalTimestamp(value.observedAt, "accepted observedAt");
    if (Date.parse(occurredAt) > Date.parse(observedAt)) {
        fail("accepted timestamp chronology is invalid");
    }
}
function assertReceipt(value, expectedOwnerScopeDigest, expectedPreviousReceiptDigest) {
    assertPlainObject(value, "promotion receipt");
    assertExactKeys(value, [
        "promotionId",
        "promotionDigest",
        "previousReceiptDigest",
        "ownerScopeDigest",
        "candidateId",
        "candidateRevisionDigest",
        "statementReferenceDigest",
        "evidenceProofDigests",
        "idempotencyKeyDigest",
        "confirmedAt",
        "accepted",
        "authority",
        "sourceWritebackAttempted",
    ], "promotion receipt");
    assertDigest(value.promotionDigest, "promotion digest");
    if (value.previousReceiptDigest !== null) {
        assertDigest(value.previousReceiptDigest, "previous receipt digest");
    }
    if (typeof value.promotionId !== "string"
        || !PROMOTION_ID.test(value.promotionId)
        || value.promotionId !== `tmcandidatepromotion_${value.promotionDigest}`
        || value.previousReceiptDigest !== expectedPreviousReceiptDigest
        || value.ownerScopeDigest !== expectedOwnerScopeDigest
        || typeof value.candidateId !== "string"
        || !CANDIDATE_ID.test(value.candidateId))
        fail("promotion receipt chain or identity is invalid");
    assertDigest(value.candidateRevisionDigest, "candidate revision");
    assertDigest(value.statementReferenceDigest, "statement reference");
    assertSortedUniqueDigests(value.evidenceProofDigests, "evidence proofs");
    if (value.candidateId !== (0, native_candidate_review_js_1.taskMapNativeCandidateId)(value.ownerScopeDigest, value.statementReferenceDigest))
        fail("promotion candidate identity is inconsistent");
    if (value.candidateRevisionDigest !== (0, native_candidate_review_js_1.taskMapNativeCandidateRevisionDigest)(value.candidateId, value.evidenceProofDigests))
        fail("promotion candidate revision is inconsistent");
    assertDigest(value.idempotencyKeyDigest, "idempotency key digest");
    canonicalTimestamp(value.confirmedAt, "confirmedAt");
    assertAcceptedPayload(value.accepted);
    assertPlainObject(value.authority, "promotion authority");
    assertExactKeys(value.authority, [
        "sourceKind",
        "authority",
        "syncMode",
        "capabilities",
        "recordKind",
        "lifecycle",
        "sourceStatus",
    ], "promotion authority");
    if ((0, source_contracts_js_1.taskMapContractCanonicalJson)(value.authority)
        !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(FIXED_AUTHORITY)
        || value.sourceWritebackAttempted !== false)
        fail("promotion authority policy is invalid");
    const receipt = value;
    const expected = receiptBase({
        previousReceiptDigest: receipt.previousReceiptDigest,
        ownerScopeDigest: receipt.ownerScopeDigest,
        candidateId: receipt.candidateId,
        candidateRevisionDigest: receipt.candidateRevisionDigest,
        statementReferenceDigest: receipt.statementReferenceDigest,
        evidenceProofDigests: receipt.evidenceProofDigests,
        idempotencyKeyDigest: receipt.idempotencyKeyDigest,
        confirmedAt: receipt.confirmedAt,
        accepted: receipt.accepted,
        authority: receipt.authority,
        sourceWritebackAttempted: false,
    });
    if (expected.promotionDigest !== value.promotionDigest) {
        fail("promotion receipt digest or chain is inconsistent");
    }
}
function assertTaskMapNativeCandidateAcceptanceStore(value) {
    assertPlainObject(value, "candidate acceptance store");
    assertExactKeys(value, [
        "contractVersion",
        "policyVersion",
        "ownerScopeDigest",
        "headReceiptDigest",
        "receipts",
        "privacy",
    ], "candidate acceptance store");
    if (value.contractVersion !== exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_VERSION
        || value.policyVersion
            !== exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_POLICY_VERSION)
        fail("candidate acceptance version is invalid");
    assertDigest(value.ownerScopeDigest, "store owner scope");
    assertDigest(value.headReceiptDigest, "store head receipt");
    if (!Array.isArray(value.receipts)
        || value.receipts.length === 0
        || value.receipts.length
            > exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1.maxReceipts)
        fail("candidate acceptance receipts exceed their bounded limit");
    let previous = null;
    const idempotencyKeys = new Set();
    const candidates = new Set();
    for (const receipt of value.receipts) {
        assertReceipt(receipt, value.ownerScopeDigest, previous);
        if (idempotencyKeys.has(receipt.idempotencyKeyDigest)) {
            fail("duplicate idempotency key in promotion chain");
        }
        if (candidates.has(receipt.candidateId)) {
            fail("duplicate candidate in promotion chain");
        }
        idempotencyKeys.add(receipt.idempotencyKeyDigest);
        candidates.add(receipt.candidateId);
        previous = receipt.promotionDigest;
    }
    if (value.headReceiptDigest !== previous) {
        fail("candidate acceptance head digest is inconsistent");
    }
    assertPlainObject(value.privacy, "candidate acceptance privacy");
    if ((0, source_contracts_js_1.taskMapContractCanonicalJson)(value.privacy)
        !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(PRIVACY))
        fail("candidate acceptance privacy contract is invalid");
    if (Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(value), "utf8")
        > exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1.maxFileBytes)
        fail("candidate acceptance store exceeds its byte limit");
}
function sameProof(receipt, input) {
    return receipt.ownerScopeDigest === input.expectedOwnerScopeDigest
        && receipt.candidateId === input.candidateId
        && receipt.candidateRevisionDigest
            === input.expectedCandidateRevisionDigest
        && receipt.statementReferenceDigest
            === input.expectedStatementReferenceDigest
        && (0, source_contracts_js_1.taskMapContractCanonicalJson)(receipt.evidenceProofDigests)
            === (0, source_contracts_js_1.taskMapContractCanonicalJson)(input.expectedEvidenceProofDigests);
}
function promoteTaskMapNativeCandidate(input) {
    assertPlainObject(input, "promotion input");
    assertExactKeys(input, [
        "result",
        "overlay",
        "previousStore",
        "expectedOwnerScopeDigest",
        "assessedAt",
        "candidateId",
        "expectedCandidateRevisionDigest",
        "expectedStatementReferenceDigest",
        "expectedEvidenceProofDigests",
        "idempotencyKeyDigest",
        "confirmedAt",
    ], "promotion input");
    assertDigest(input.expectedOwnerScopeDigest, "expected owner scope");
    assertDigest(input.expectedCandidateRevisionDigest, "expected candidate revision");
    assertDigest(input.expectedStatementReferenceDigest, "expected statement reference");
    assertSortedUniqueDigests(input.expectedEvidenceProofDigests, "expected evidence proofs");
    assertDigest(input.idempotencyKeyDigest, "idempotency key digest");
    canonicalTimestamp(input.confirmedAt, "confirmedAt");
    if (!CANDIDATE_ID.test(input.candidateId))
        fail("candidate ID is invalid");
    if (input.previousStore !== null) {
        assertTaskMapNativeCandidateAcceptanceStore(input.previousStore);
        if (input.previousStore.ownerScopeDigest !== input.expectedOwnerScopeDigest) {
            fail("promotion store belongs to another owner");
        }
        const keyed = input.previousStore.receipts.find((receipt) => receipt.idempotencyKeyDigest === input.idempotencyKeyDigest);
        if (keyed !== undefined) {
            if (!sameProof(keyed, input))
                fail("idempotency key conflicts with another proof");
            return deepFreeze({ store: input.previousStore, receipt: keyed });
        }
        if (input.previousStore.receipts.some((receipt) => receipt.candidateId === input.candidateId))
            fail("candidate was already promoted under a different key");
    }
    if (input.result === null || input.overlay === null) {
        fail("current authenticated candidate proof is unavailable");
    }
    const proof = (0, native_candidate_review_js_1.resolveTaskMapNativeCandidateProof)({
        result: input.result,
        overlay: input.overlay,
        expectedOwnerScopeDigest: input.expectedOwnerScopeDigest,
        assessedAt: input.assessedAt,
        candidateId: input.candidateId,
    });
    if (!proof.promotionEligible)
        fail("candidate is not promotion eligible");
    if (proof.candidateRevisionDigest !== input.expectedCandidateRevisionDigest
        || proof.statementReferenceDigest
            !== input.expectedStatementReferenceDigest
        || (0, source_contracts_js_1.taskMapContractCanonicalJson)(proof.evidenceProofDigests)
            !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(input.expectedEvidenceProofDigests))
        fail("exact current candidate proof does not match confirmation");
    const previousReceiptDigest = input.previousStore?.headReceiptDigest ?? null;
    const receipt = receiptBase({
        previousReceiptDigest,
        ownerScopeDigest: input.expectedOwnerScopeDigest,
        candidateId: proof.candidateId,
        candidateRevisionDigest: proof.candidateRevisionDigest,
        statementReferenceDigest: proof.statementReferenceDigest,
        evidenceProofDigests: [...proof.evidenceProofDigests],
        idempotencyKeyDigest: input.idempotencyKeyDigest,
        confirmedAt: input.confirmedAt,
        accepted: acceptedPayload(proof),
        authority: FIXED_AUTHORITY,
        sourceWritebackAttempted: false,
    });
    const store = {
        contractVersion: exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_VERSION,
        policyVersion: exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_POLICY_VERSION,
        ownerScopeDigest: input.expectedOwnerScopeDigest,
        headReceiptDigest: receipt.promotionDigest,
        receipts: [...(input.previousStore?.receipts ?? []), receipt],
        privacy: PRIVACY,
    };
    assertTaskMapNativeCandidateAcceptanceStore(store);
    return deepFreeze({ store, receipt });
}
/**
 * Re-resolves one ephemeral v2 agent proposal and appends the existing
 * byte-compatible v1 owner receipt. This grants only local manual-task
 * authority; it does not approve, export, route, select, or start an agent.
 */
function promoteTaskMapAgentSessionCandidate(input) {
    assertPlainObject(input, "agent candidate promotion input");
    assertExactKeys(input, [
        "admission",
        "extraction",
        "overlay",
        "previousStore",
        "expectedOwnerScopeDigest",
        "expectedAcceptanceHeadDigest",
        "assessedAt",
        "candidateId",
        "expectedCandidateRevisionDigest",
        "expectedStatementReferenceDigest",
        "expectedEvidenceProofDigests",
        "idempotencyKeyDigest",
        "confirmedAt",
    ], "agent candidate promotion input");
    assertDigest(input.expectedOwnerScopeDigest, "expected owner scope");
    assertDigest(input.expectedAcceptanceHeadDigest, "expected acceptance head");
    assertDigest(input.expectedCandidateRevisionDigest, "expected candidate revision");
    assertDigest(input.expectedStatementReferenceDigest, "expected statement reference");
    assertSortedUniqueDigests(input.expectedEvidenceProofDigests, "expected evidence proofs");
    assertDigest(input.idempotencyKeyDigest, "idempotency key digest");
    canonicalTimestamp(input.confirmedAt, "confirmedAt");
    if (!CANDIDATE_ID.test(input.candidateId))
        fail("candidate ID is invalid");
    if (input.previousStore !== null) {
        assertTaskMapNativeCandidateAcceptanceStore(input.previousStore);
        if (input.previousStore.ownerScopeDigest
            !== input.expectedOwnerScopeDigest)
            fail("promotion store belongs to another owner");
    }
    if (taskMapNativeCandidateAcceptanceHeadDigest(input.previousStore)
        !== input.expectedAcceptanceHeadDigest)
        fail("current receipt head does not match confirmation");
    if (input.previousStore !== null) {
        const keyed = input.previousStore.receipts.find((receipt) => receipt.idempotencyKeyDigest === input.idempotencyKeyDigest);
        if (keyed !== undefined) {
            if (!sameProof(keyed, input)) {
                fail("idempotency key conflicts with another proof");
            }
            return deepFreeze({ store: input.previousStore, receipt: keyed });
        }
        if (input.previousStore.receipts.some((receipt) => receipt.candidateId === input.candidateId))
            fail("candidate was already promoted under a different key");
    }
    const projection = (0, agent_session_candidate_adapter_js_1.buildTaskMapAgentSessionCandidateReview)({
        admission: input.admission,
        extraction: input.extraction,
        previous: input.overlay,
        expectedOwnerScopeDigest: input.expectedOwnerScopeDigest,
        assessedAt: input.assessedAt,
    });
    const proof = projection.shelf.candidates.find((candidate) => candidate.candidateId === input.candidateId);
    if (proof === undefined
        || proof.candidateFamily !== "agent_session"
        || proof.promotionEligible !== true)
        fail("agent candidate is unavailable or not promotion eligible");
    if (proof.candidateRevisionDigest
        !== input.expectedCandidateRevisionDigest
        || proof.statementReferenceDigest
            !== input.expectedStatementReferenceDigest
        || (0, source_contracts_js_1.taskMapContractCanonicalJson)(proof.evidenceProofDigests)
            !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(input.expectedEvidenceProofDigests))
        fail("exact current agent candidate proof does not match confirmation");
    const receipt = receiptBase({
        previousReceiptDigest: input.previousStore?.headReceiptDigest ?? null,
        ownerScopeDigest: input.expectedOwnerScopeDigest,
        candidateId: proof.candidateId,
        candidateRevisionDigest: proof.candidateRevisionDigest,
        statementReferenceDigest: proof.statementReferenceDigest,
        evidenceProofDigests: [...proof.evidenceProofDigests],
        idempotencyKeyDigest: input.idempotencyKeyDigest,
        confirmedAt: input.confirmedAt,
        accepted: {
            kind: proof.kind,
            title: proof.title,
            summary: proof.summary,
            speechActClass: proof.speechActClass,
            speechActActor: proof.speechActActor,
            mentionIdentityDigest: proof.mentionIdentityDigest,
            confidence: proof.confidence,
            occurredAt: proof.occurredAt,
            observedAt: proof.observedAt,
        },
        authority: FIXED_AUTHORITY,
        sourceWritebackAttempted: false,
    });
    const store = {
        contractVersion: exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_VERSION,
        policyVersion: exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_POLICY_VERSION,
        ownerScopeDigest: input.expectedOwnerScopeDigest,
        headReceiptDigest: receipt.promotionDigest,
        receipts: [...(input.previousStore?.receipts ?? []), receipt],
        privacy: PRIVACY,
    };
    assertTaskMapNativeCandidateAcceptanceStore(store);
    return deepFreeze({ store, receipt });
}
/** Re-resolves one calendar proposal before granting local manual authority. */
function promoteTaskMapCalendarCandidate(input) {
    assertPlainObject(input, "calendar candidate promotion input");
    assertExactKeys(input, [
        "result",
        "extraction",
        "overlay",
        "previousStore",
        "expectedOwnerScopeDigest",
        "expectedAcceptanceHeadDigest",
        "assessedAt",
        "candidateId",
        "expectedCandidateRevisionDigest",
        "expectedStatementReferenceDigest",
        "expectedEvidenceProofDigests",
        "idempotencyKeyDigest",
        "confirmedAt",
    ], "calendar candidate promotion input");
    assertDigest(input.expectedOwnerScopeDigest, "expected owner scope");
    assertDigest(input.expectedAcceptanceHeadDigest, "expected acceptance head");
    assertDigest(input.expectedCandidateRevisionDigest, "expected candidate revision");
    assertDigest(input.expectedStatementReferenceDigest, "expected statement reference");
    assertSortedUniqueDigests(input.expectedEvidenceProofDigests, "expected evidence proofs");
    assertDigest(input.idempotencyKeyDigest, "idempotency key digest");
    canonicalTimestamp(input.confirmedAt, "confirmedAt");
    if (!CANDIDATE_ID.test(input.candidateId))
        fail("candidate ID is invalid");
    if (input.previousStore !== null) {
        assertTaskMapNativeCandidateAcceptanceStore(input.previousStore);
        if (input.previousStore.ownerScopeDigest !== input.expectedOwnerScopeDigest) {
            fail("promotion store belongs to another owner");
        }
    }
    if (taskMapNativeCandidateAcceptanceHeadDigest(input.previousStore)
        !== input.expectedAcceptanceHeadDigest)
        fail("current receipt head does not match confirmation");
    if (input.previousStore !== null) {
        const keyed = input.previousStore.receipts.find((receipt) => receipt.idempotencyKeyDigest === input.idempotencyKeyDigest);
        if (keyed !== undefined) {
            if (!sameProof(keyed, input)) {
                fail("idempotency key conflicts with another proof");
            }
            return deepFreeze({ store: input.previousStore, receipt: keyed });
        }
        if (input.previousStore.receipts.some((receipt) => receipt.candidateId === input.candidateId))
            fail("candidate was already promoted under a different key");
    }
    const projection = (0, calendar_candidate_adapter_js_1.buildTaskMapCalendarCandidateReview)({
        result: input.result,
        extraction: input.extraction,
        previous: input.overlay,
        expectedOwnerScopeDigest: input.expectedOwnerScopeDigest,
        assessedAt: input.assessedAt,
    });
    const proof = projection.shelf.candidates.find((candidate) => candidate.candidateId === input.candidateId);
    if (proof === undefined
        || proof.candidateFamily !== "calendar"
        || proof.promotionEligible !== true)
        fail("calendar candidate is unavailable or not promotion eligible");
    if (proof.candidateRevisionDigest !== input.expectedCandidateRevisionDigest
        || proof.statementReferenceDigest !== input.expectedStatementReferenceDigest
        || (0, source_contracts_js_1.taskMapContractCanonicalJson)(proof.evidenceProofDigests)
            !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(input.expectedEvidenceProofDigests))
        fail("exact current calendar candidate proof does not match confirmation");
    const receipt = receiptBase({
        previousReceiptDigest: input.previousStore?.headReceiptDigest ?? null,
        ownerScopeDigest: input.expectedOwnerScopeDigest,
        candidateId: proof.candidateId,
        candidateRevisionDigest: proof.candidateRevisionDigest,
        statementReferenceDigest: proof.statementReferenceDigest,
        evidenceProofDigests: [...proof.evidenceProofDigests],
        idempotencyKeyDigest: input.idempotencyKeyDigest,
        confirmedAt: input.confirmedAt,
        accepted: {
            kind: proof.kind,
            title: proof.title,
            summary: proof.summary,
            speechActClass: proof.speechActClass,
            speechActActor: proof.speechActActor,
            mentionIdentityDigest: proof.mentionIdentityDigest,
            confidence: proof.confidence,
            occurredAt: proof.occurredAt,
            observedAt: proof.observedAt,
        },
        authority: FIXED_AUTHORITY,
        sourceWritebackAttempted: false,
    });
    const store = {
        contractVersion: exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_VERSION,
        policyVersion: exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_POLICY_VERSION,
        ownerScopeDigest: input.expectedOwnerScopeDigest,
        headReceiptDigest: receipt.promotionDigest,
        receipts: [...(input.previousStore?.receipts ?? []), receipt],
        privacy: PRIVACY,
    };
    assertTaskMapNativeCandidateAcceptanceStore(store);
    return deepFreeze({ store, receipt });
}
/**
 * Task 7 promotion resolver. Raw evidence can enter only through the
 * process-local verified-report capability; candidate proof is always
 * recomputed and never supplied by the caller.
 */
function promoteTaskMapVerifiedMeetingCandidate(input) {
    assertPlainObject(input, "verified meeting promotion input");
    assertExactKeys(input, [
        "result",
        "overlay",
        "rawReport",
        "previousStore",
        "expectedOwnerScopeDigest",
        "assessedAt",
        "candidateId",
        "expectedCandidateRevisionDigest",
        "expectedStatementReferenceDigest",
        "expectedEvidenceProofDigests",
        "idempotencyKeyDigest",
        "confirmedAt",
    ], "verified meeting promotion input");
    assertDigest(input.expectedOwnerScopeDigest, "expected owner scope");
    assertDigest(input.expectedCandidateRevisionDigest, "expected candidate revision");
    assertDigest(input.expectedStatementReferenceDigest, "expected statement reference");
    assertSortedUniqueDigests(input.expectedEvidenceProofDigests, "expected evidence proofs");
    assertDigest(input.idempotencyKeyDigest, "idempotency key digest");
    canonicalTimestamp(input.confirmedAt, "confirmedAt");
    if (!CANDIDATE_ID.test(input.candidateId))
        fail("candidate ID is invalid");
    if (input.previousStore !== null) {
        assertTaskMapNativeCandidateAcceptanceStore(input.previousStore);
        if (input.previousStore.ownerScopeDigest !== input.expectedOwnerScopeDigest) {
            fail("promotion store belongs to another owner");
        }
        const keyed = input.previousStore.receipts.find((receipt) => receipt.idempotencyKeyDigest === input.idempotencyKeyDigest);
        if (keyed !== undefined) {
            if (!sameProof(keyed, input))
                fail("idempotency key conflicts with another proof");
            return deepFreeze({ store: input.previousStore, receipt: keyed });
        }
        if (input.previousStore.receipts.some((receipt) => receipt.candidateId === input.candidateId))
            fail("candidate was already promoted under a different key");
    }
    if (input.overlay === null || (input.result === null && input.rawReport === null)) {
        fail("current authenticated candidate proof is unavailable");
    }
    let googleCandidates = [];
    if (input.result !== null) {
        const googleOverlay = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateReview)({
            result: input.result,
            previous: input.overlay,
            expectedOwnerScopeDigest: input.expectedOwnerScopeDigest,
            assessedAt: input.assessedAt,
        });
        googleCandidates = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateShelf)(input.result, googleOverlay, input.assessedAt).candidates;
    }
    const context = (0, meeting_refresh_llm_replay_js_1.buildTaskMapUnifiedMeetingCandidateContext)({
        ownerScopeDigest: input.expectedOwnerScopeDigest,
        assessedAt: input.assessedAt,
        googleCandidates,
        googleResultDigest: input.result?.resultDigest ?? null,
        googleSnapshotDigest: input.result?.snapshot?.snapshotDigest ?? null,
        googleProducedAt: input.result?.snapshot?.producedAt ?? null,
        rawReport: input.rawReport,
    });
    const proof = (0, native_candidate_review_js_1.applyTaskMapNativeCandidateReviewToProofRows)({
        context,
        overlay: input.overlay,
    }).find((row) => row.candidateId === input.candidateId);
    if (proof === undefined || !proof.promotionEligible) {
        fail("candidate is unavailable or not promotion eligible");
    }
    if (proof.candidateRevisionDigest !== input.expectedCandidateRevisionDigest
        || proof.statementReferenceDigest !== input.expectedStatementReferenceDigest
        || (0, source_contracts_js_1.taskMapContractCanonicalJson)(proof.evidenceProofDigests)
            !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(input.expectedEvidenceProofDigests))
        fail("exact current candidate proof does not match confirmation");
    const receipt = receiptBase({
        previousReceiptDigest: input.previousStore?.headReceiptDigest ?? null,
        ownerScopeDigest: input.expectedOwnerScopeDigest,
        candidateId: proof.candidateId,
        candidateRevisionDigest: proof.candidateRevisionDigest,
        statementReferenceDigest: proof.statementReferenceDigest,
        evidenceProofDigests: [...proof.evidenceProofDigests],
        idempotencyKeyDigest: input.idempotencyKeyDigest,
        confirmedAt: input.confirmedAt,
        accepted: acceptedPayload(proof),
        authority: FIXED_AUTHORITY,
        sourceWritebackAttempted: false,
    });
    const store = {
        contractVersion: exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_VERSION,
        policyVersion: exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_POLICY_VERSION,
        ownerScopeDigest: input.expectedOwnerScopeDigest,
        headReceiptDigest: receipt.promotionDigest,
        receipts: [...(input.previousStore?.receipts ?? []), receipt],
        privacy: PRIVACY,
    };
    assertTaskMapNativeCandidateAcceptanceStore(store);
    return deepFreeze({ store, receipt });
}
function taskMapNativeCandidateAcceptanceHeadDigest(store) {
    if (store === null) {
        return (0, source_contracts_js_1.taskMapContractDigest)({ domain: EMPTY_HEAD_DIGEST_DOMAIN });
    }
    assertTaskMapNativeCandidateAcceptanceStore(store);
    return store.headReceiptDigest;
}
/** Presentation-only omission behind the authenticated receipt-store gate. */
function filterTaskMapNativeCandidateShelfAgainstAcceptanceStore(rows, store, expectedOwnerScopeDigest, publishedPromotionIds) {
    assertDigest(expectedOwnerScopeDigest, "expected owner scope");
    if (store === null)
        return [...rows];
    assertTaskMapNativeCandidateAcceptanceStore(store);
    if (store.ownerScopeDigest !== expectedOwnerScopeDigest) {
        fail("candidate shelf acceptance store belongs to another owner");
    }
    const promoted = new Set(store.receipts.flatMap((receipt) => publishedPromotionIds === undefined
        || publishedPromotionIds.has(receipt.promotionId)
        ? [receipt.candidateId]
        : []));
    return rows.filter((row) => !promoted.has(row.candidateId));
}
function taskMapNativeCandidateAcceptanceManualAuthorityRecords(store) {
    assertTaskMapNativeCandidateAcceptanceStore(store);
    const pointers = [];
    const events = [];
    const sourceBindings = [];
    const evidenceBindings = [];
    for (const receipt of store.receipts) {
        const pointerId = `tmcandidatepromotion_${receipt.promotionDigest}`;
        const eventId = `tmcandidatepromotionevent_${receipt.promotionDigest}`;
        pointers.push({
            id: pointerId,
            sourceKind: "manual",
            sourceObjectId: receipt.promotionDigest,
            sourceRefHash: receipt.promotionDigest,
            sourceVersion: receipt.promotionDigest,
            authority: "user",
            syncMode: "personal_fork",
            capabilities: ["read_task"],
        });
        events.push({
            id: eventId,
            pointerId,
            recordKind: "authoritative_task",
            activity: "task_created",
            occurredAt: receipt.confirmedAt,
            observedAt: receipt.confirmedAt,
            objectRefs: [
                `external:${receipt.statementReferenceDigest}`,
                `promotion-proof:${receipt.promotionDigest}`,
            ],
            title: receipt.accepted.title,
            summary: receipt.accepted.summary,
            extractionConfidence: receipt.accepted.confidence,
            sourceStatus: "open",
            bodyJoinEligible: false,
        });
        sourceBindings.push({
            pointerId,
            semanticClass: "source_authoritative",
            semanticOriginId: receipt.promotionDigest,
            semanticIdentityDigest: receipt.promotionDigest,
            sourceIdentityDigest: receipt.promotionDigest,
            observedRevision: receipt.promotionDigest,
            evidenceRevision: receipt.promotionDigest,
            observedContentDigest: receipt.promotionDigest,
            evidenceContentDigest: receipt.promotionDigest,
        });
        evidenceBindings.push({
            eventId,
            disposition: "source_authoritative",
            rootLinkRefs: [`external:${receipt.statementReferenceDigest}`],
        });
    }
    return deepFreeze({
        ownerScopeDigest: store.ownerScopeDigest,
        generatedAt: store.receipts.reduce((latest, receipt) => receipt.confirmedAt > latest
            ? receipt.confirmedAt
            : latest, store.receipts[0].confirmedAt),
        pointers,
        events,
        sourceBindings,
        evidenceBindings,
    });
}
/**
 * The sole Task 6 authority merge. Manual records are rehydrated internally
 * from a fully validated receipt store; callers cannot supply raw authority.
 */
function mergeTaskMapNativeCandidateAcceptanceIntoSemanticInput(base, store) {
    assertTaskMapNativeCandidateAcceptanceStore(store);
    if (base.ownerScopeDigest !== store.ownerScopeDigest) {
        fail("semantic input and acceptance store belong to different owners");
    }
    const manual = taskMapNativeCandidateAcceptanceManualAuthorityRecords(store);
    return {
        ...base,
        sourceBindings: [...base.sourceBindings, ...manual.sourceBindings]
            .sort((left, right) => left.pointerId.localeCompare(right.pointerId)),
        evidenceBindings: [...base.evidenceBindings, ...manual.evidenceBindings]
            .sort((left, right) => left.eventId.localeCompare(right.eventId)),
        taskMapInput: {
            ...base.taskMapInput,
            generatedAt: manual.generatedAt > base.taskMapInput.generatedAt
                ? manual.generatedAt
                : base.taskMapInput.generatedAt,
            pointers: [...base.taskMapInput.pointers, ...manual.pointers]
                .map((pointer) => ({
                ...pointer,
                capabilities: [...pointer.capabilities].sort(),
            }))
                .sort((left, right) => left.id.localeCompare(right.id)),
            events: [...base.taskMapInput.events, ...manual.events]
                .map((event) => ({
                ...event,
                objectRefs: [...event.objectRefs].sort(),
            }))
                .sort((left, right) => left.id.localeCompare(right.id)),
        },
    };
}
function assertStorePath(storePath) {
    if (typeof storePath !== "string"
        || !node_path_1.default.isAbsolute(storePath)
        || node_path_1.default.normalize(storePath) !== storePath
        || PATH_CONTROL_CHARACTER.test(storePath))
        fail("store path is invalid");
}
async function ensurePrivateParent(storePath) {
    const parent = node_path_1.default.dirname(storePath);
    try {
        await (0, promises_1.mkdir)(parent, { recursive: false, mode: DIRECTORY_MODE });
    }
    catch (error) {
        if (errnoCode(error) !== "EEXIST")
            throw error;
    }
    const stats = await (0, promises_1.lstat)(parent, { bigint: true });
    const uid = typeof process.getuid === "function" ? BigInt(process.getuid()) : stats.uid;
    if (stats.isSymbolicLink()
        || !stats.isDirectory()
        || stats.uid !== uid
        || Number(stats.mode & 511n) !== DIRECTORY_MODE
        || await (0, promises_1.realpath)(parent) !== parent)
        fail("store parent must be an owner-only real 0700 directory");
    return { parent, dev: stats.dev, ino: stats.ino };
}
async function privateParentIfPresent(storePath) {
    const parent = node_path_1.default.dirname(storePath);
    let stats;
    try {
        stats = await (0, promises_1.lstat)(parent, { bigint: true });
    }
    catch (error) {
        if (errnoCode(error) === "ENOENT")
            return null;
        throw error;
    }
    const uid = typeof process.getuid === "function" ? BigInt(process.getuid()) : stats.uid;
    if (stats.isSymbolicLink()
        || !stats.isDirectory()
        || stats.uid !== uid
        || Number(stats.mode & 511n) !== DIRECTORY_MODE
        || await (0, promises_1.realpath)(parent) !== parent)
        fail("store parent must be an owner-only real 0700 directory");
    return { parent, dev: stats.dev, ino: stats.ino };
}
async function assertExistingTargetSafe(storePath) {
    try {
        const stats = await (0, promises_1.lstat)(storePath, { bigint: true });
        const uid = typeof process.getuid === "function" ? BigInt(process.getuid()) : stats.uid;
        if (stats.isSymbolicLink()
            || !stats.isFile()
            || stats.uid !== uid
            || Number(stats.mode & 511n) !== FILE_MODE
            || stats.nlink !== 1n
            || stats.size < 2n
            || stats.size > BigInt(exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1.maxFileBytes))
            fail("existing store target is not an owner-only 0600 regular file");
    }
    catch (error) {
        if (errnoCode(error) === "ENOENT")
            return;
        throw error;
    }
}
async function loadTaskMapNativeCandidateAcceptanceStore(input) {
    assertPlainObject(input, "load store input");
    const inputKeys = Object.keys(input).sort();
    const allowedInputKeys = [
        "afterAuthenticatedReadForTesting",
        "expectedOwnerScopeDigest",
        "storePath",
    ];
    if (!inputKeys.includes("storePath")
        || !inputKeys.includes("expectedOwnerScopeDigest")
        || inputKeys.some((key) => !allowedInputKeys.includes(key))
        || (input.afterAuthenticatedReadForTesting !== undefined
            && typeof input.afterAuthenticatedReadForTesting !== "function"))
        fail("load store input keys");
    assertStorePath(input.storePath);
    assertDigest(input.expectedOwnerScopeDigest, "expected owner scope");
    const authenticatedParent = await privateParentIfPresent(input.storePath);
    if (authenticatedParent === null)
        return null;
    let handle;
    try {
        handle = await (0, promises_1.open)(input.storePath, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_NOFOLLOW);
        const before = await handle.stat({ bigint: true });
        const uid = typeof process.getuid === "function" ? BigInt(process.getuid()) : before.uid;
        if (!before.isFile()
            || before.uid !== uid
            || Number(before.mode & 511n) !== FILE_MODE
            || before.nlink !== 1n
            || before.size < 2n
            || before.size > BigInt(exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1.maxFileBytes))
            fail("store file authentication failed");
        const maximumBytes = exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1.maxFileBytes;
        const bounded = Buffer.allocUnsafe(maximumBytes + 1);
        let byteLength = 0;
        while (byteLength < bounded.length) {
            const { bytesRead } = await handle.read(bounded, byteLength, bounded.length - byteLength, byteLength);
            if (bytesRead === 0)
                break;
            byteLength += bytesRead;
        }
        if (byteLength > maximumBytes) {
            fail("store file authentication failed");
        }
        const bytes = bounded.subarray(0, byteLength);
        await input.afterAuthenticatedReadForTesting?.(input.storePath);
        const after = await handle.stat({ bigint: true });
        let current;
        try {
            current = await (0, promises_1.lstat)(input.storePath, { bigint: true });
        }
        catch {
            fail("store file changed during read");
        }
        const currentParent = await privateParentIfPresent(input.storePath);
        const metadataMatchesBefore = (metadata) => metadata.isFile()
            && !metadata.isSymbolicLink()
            && metadata.dev === before.dev
            && metadata.ino === before.ino
            && metadata.size === before.size
            && metadata.mtimeNs === before.mtimeNs
            && metadata.ctimeNs === before.ctimeNs
            && metadata.mode === before.mode
            && metadata.uid === before.uid
            && metadata.nlink === before.nlink
            && metadata.nlink === 1n
            && Number(metadata.mode & 511n) === FILE_MODE
            && metadata.uid === uid;
        if (BigInt(bytes.byteLength) !== before.size
            || !metadataMatchesBefore(after)
            || !metadataMatchesBefore(current)
            || currentParent === null
            || currentParent.dev !== authenticatedParent.dev
            || currentParent.ino !== authenticatedParent.ino)
            fail("store file changed during read");
        let decoded;
        try {
            decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        }
        catch {
            fail("store bytes are invalid UTF-8");
        }
        let parsed;
        try {
            parsed = JSON.parse(decoded);
        }
        catch {
            fail("store bytes are invalid JSON");
        }
        assertTaskMapNativeCandidateAcceptanceStore(parsed);
        if (parsed.ownerScopeDigest !== input.expectedOwnerScopeDigest
            || (0, source_contracts_js_1.taskMapContractCanonicalJson)(parsed) !== decoded)
            fail("store bytes are noncanonical or belong to another owner");
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
async function writeTaskMapNativeCandidateAcceptanceStore(input) {
    assertPlainObject(input, "write store input");
    assertExactKeys(input, ["storePath", "expectedOwnerScopeDigest", "store"], "write store input");
    assertStorePath(input.storePath);
    assertDigest(input.expectedOwnerScopeDigest, "expected owner scope");
    assertTaskMapNativeCandidateAcceptanceStore(input.store);
    if (input.store.ownerScopeDigest !== input.expectedOwnerScopeDigest) {
        fail("store belongs to another owner");
    }
    const preflightCurrent = await loadTaskMapNativeCandidateAcceptanceStore({
        storePath: input.storePath,
        expectedOwnerScopeDigest: input.expectedOwnerScopeDigest,
    });
    if (preflightCurrent === null
        && (input.store.receipts.length !== 1
            || input.store.receipts[0].previousReceiptDigest !== null))
        fail("initial store must contain exactly one genesis receipt");
    await (0, native_candidate_review_js_1.withTaskMapNativeCandidateReviewTransaction)({
        overlayPath: input.storePath,
        expectedOwnerScopeDigest: input.expectedOwnerScopeDigest,
    }, async () => writeTaskMapNativeCandidateAcceptanceStoreUnderLock(input));
}
function isExactOneReceiptExtension(current, proposed) {
    if (proposed.receipts.length !== current.receipts.length + 1)
        return false;
    if (proposed.contractVersion !== current.contractVersion
        || proposed.policyVersion !== current.policyVersion
        || proposed.ownerScopeDigest !== current.ownerScopeDigest
        || (0, source_contracts_js_1.taskMapContractCanonicalJson)(proposed.privacy)
            !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(current.privacy))
        return false;
    return current.receipts.every((receipt, index) => (0, source_contracts_js_1.taskMapContractCanonicalJson)(receipt)
        === (0, source_contracts_js_1.taskMapContractCanonicalJson)(proposed.receipts[index])) && proposed.receipts[current.receipts.length].previousReceiptDigest
        === current.headReceiptDigest;
}
async function writeTaskMapNativeCandidateAcceptanceStoreUnderLock(input) {
    const bytes = (0, source_contracts_js_1.taskMapContractCanonicalJson)(input.store);
    const current = await loadTaskMapNativeCandidateAcceptanceStore({
        storePath: input.storePath,
        expectedOwnerScopeDigest: input.expectedOwnerScopeDigest,
    });
    const currentBytes = current === null
        ? null
        : (0, source_contracts_js_1.taskMapContractCanonicalJson)(current);
    if (current === null
        && (input.store.receipts.length !== 1
            || input.store.receipts[0].previousReceiptDigest !== null))
        fail("initial store must contain exactly one genesis receipt");
    if (currentBytes === bytes)
        return;
    if (current !== null && !isExactOneReceiptExtension(current, input.store)) {
        fail("store update is stale, rolled back, or not an exact one-receipt append");
    }
    const parent = await ensurePrivateParent(input.storePath);
    await assertExistingTargetSafe(input.storePath);
    const stagePath = node_path_1.default.join(parent.parent, `.candidate-acceptance-${(0, node_crypto_1.randomBytes)(16).toString("hex")}.tmp`);
    let stageExists = false;
    let handle;
    try {
        handle = await (0, promises_1.open)(stagePath, node_fs_1.constants.O_WRONLY
            | node_fs_1.constants.O_CREAT
            | node_fs_1.constants.O_EXCL
            | node_fs_1.constants.O_NOFOLLOW, FILE_MODE);
        stageExists = true;
        await handle.writeFile(bytes, "utf8");
        await handle.sync();
        const stats = await handle.stat({ bigint: true });
        if (!stats.isFile()
            || Number(stats.mode & 511n) !== FILE_MODE
            || stats.nlink !== 1n
            || stats.size !== BigInt(Buffer.byteLength(bytes, "utf8")))
            fail("staged store authentication failed");
        await handle.close();
        handle = undefined;
        const parentNow = await (0, promises_1.lstat)(parent.parent, { bigint: true });
        if (parentNow.dev !== parent.dev
            || parentNow.ino !== parent.ino
            || Number(parentNow.mode & 511n) !== DIRECTORY_MODE)
            fail("store parent changed during write");
        await assertExistingTargetSafe(input.storePath);
        const currentBeforeRename = await loadTaskMapNativeCandidateAcceptanceStore({
            storePath: input.storePath,
            expectedOwnerScopeDigest: input.expectedOwnerScopeDigest,
        });
        const currentBeforeRenameBytes = currentBeforeRename === null
            ? null
            : (0, source_contracts_js_1.taskMapContractCanonicalJson)(currentBeforeRename);
        if (currentBeforeRenameBytes !== currentBytes) {
            fail("store append became stale before rename");
        }
        await (0, promises_1.rename)(stagePath, input.storePath);
        stageExists = false;
        const directoryHandle = await (0, promises_1.open)(parent.parent, node_fs_1.constants.O_RDONLY);
        await directoryHandle.sync().finally(() => directoryHandle.close());
        const loaded = await loadTaskMapNativeCandidateAcceptanceStore({
            storePath: input.storePath,
            expectedOwnerScopeDigest: input.expectedOwnerScopeDigest,
        });
        if (loaded === null || (0, source_contracts_js_1.taskMapContractCanonicalJson)(loaded) !== bytes) {
            fail("store readback does not match staged bytes");
        }
    }
    finally {
        await handle?.close().catch(() => undefined);
        if (stageExists)
            await (0, promises_1.unlink)(stagePath).catch(() => undefined);
    }
}
