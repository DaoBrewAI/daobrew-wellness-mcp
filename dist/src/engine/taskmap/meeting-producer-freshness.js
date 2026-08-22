"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_MEETING_PRODUCER_LIMITS_V1 = exports.TASKMAP_MEETING_NORMALIZED_STATEMENT_REFERENCE_DOMAIN = exports.TASKMAP_MEETING_STATEMENT_REFERENCE_DOMAIN = exports.TASKMAP_MEETING_PRODUCER_MAX_AGE_MS = exports.TASKMAP_MEETING_PRODUCER_OWNER_SCOPE_DOMAIN = exports.TASKMAP_MEETING_PRODUCER_VERSION = exports.TASKMAP_MEETING_PRODUCER_RESULT_VERSION = exports.TASKMAP_MEETING_PRODUCER_SNAPSHOT_VERSION = void 0;
exports.taskMapMeetingObligationGate = taskMapMeetingObligationGate;
exports.taskMapMeetingStatementReferenceDigest = taskMapMeetingStatementReferenceDigest;
exports.buildTaskMapMeetingProducerSnapshot = buildTaskMapMeetingProducerSnapshot;
exports.assertTaskMapMeetingProducerSnapshot = assertTaskMapMeetingProducerSnapshot;
exports.taskMapMeetingProducerLastGoodRef = taskMapMeetingProducerLastGoodRef;
exports.assessTaskMapMeetingProducerSnapshot = assessTaskMapMeetingProducerSnapshot;
exports.taskMapMeetingProducerOwnerScopeDigest = taskMapMeetingProducerOwnerScopeDigest;
exports.taskMapMeetingProducerSnapshotPath = taskMapMeetingProducerSnapshotPath;
exports.loadTaskMapMeetingProducerResult = loadTaskMapMeetingProducerResult;
exports.assertTaskMapMeetingProducerResult = assertTaskMapMeetingProducerResult;
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const source_contracts_js_1 = require("./source-contracts.js");
const owner_scope_js_1 = require("./owner-scope.js");
const text_contract_js_1 = require("./text-contract.js");
/**
 * This artifact is deliberately separate from TaskMapSourceEnvelopeV1.
 * Source envelopes remain metadata-only; this contract carries only bounded,
 * producer-reviewed meeting evidence.
 */
exports.TASKMAP_MEETING_PRODUCER_SNAPSHOT_VERSION = "taskmap-meeting-producer-snapshot.v1";
exports.TASKMAP_MEETING_PRODUCER_RESULT_VERSION = "taskmap-meeting-producer-result.v1";
exports.TASKMAP_MEETING_PRODUCER_VERSION = "taskmap-meeting-producer.1";
exports.TASKMAP_MEETING_PRODUCER_OWNER_SCOPE_DOMAIN = "taskmap-owner-local.1";
exports.TASKMAP_MEETING_PRODUCER_MAX_AGE_MS = 14_400_000;
exports.TASKMAP_MEETING_STATEMENT_REFERENCE_DOMAIN = "taskmap-meeting-statement-reference.1";
exports.TASKMAP_MEETING_NORMALIZED_STATEMENT_REFERENCE_DOMAIN = "taskmap-meeting-normalized-statement-reference.1";
exports.TASKMAP_MEETING_PRODUCER_LIMITS_V1 = Object.freeze({
    maxMeetings: 64,
    maxVariantsPerMeeting: 8,
    maxEvidencePerVariant: 20,
    maxEvidenceGlobal: 128,
    maxObjectRefsPerEvidence: 16,
    maxTitleCharacters: 96,
    maxSummaryCharacters: 200,
    maxFileBytes: 256 * 1_024,
    maxOpaqueBytes: 1_024,
});
const SHA256 = /^[a-f0-9]{64}$/;
const STABLE_ID = /^[a-z][a-z0-9_]{1,31}_[a-f0-9]{16}$/;
const STRICT_RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const CONTROL_CHARACTER = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const EMAIL_ADDRESS = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/i;
const CREDENTIAL_ASSIGNMENT = /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|passwd|secret|client[_-]?secret)\s*[:=]\s*["']?[^\s"',;]{4,}/i;
const BEARER_SECRET = /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}(?=$|[\s,.;)])/i;
const PROVIDER_TOKEN = /(?:\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}\b|\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b|\bAKIA[0-9A-Z]{16}\b)/;
const JWT_SECRET = /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/;
const LOCAL_FILE_URI = /(?:^|[^A-Za-z0-9_])file:\/\/\/[^\s]+/i;
const OWNER_LOCAL_ABSOLUTE_PATH = /(?:^|[^A-Za-z0-9_:/\\])(?:\/[^\s]+|~\/[^\s]+|[A-Za-z]:[\\/][^\s]+|\\\\[^\\\s]+\\[^\s]+)/;
const PRIVACY = Object.freeze({
    sourceBodiesStored: false,
    transcriptBodiesStored: false,
    emailContentStored: false,
    participantDetailsStored: false,
    credentialsStored: false,
    localPathsStored: false,
});
const SNAPSHOT_KEYS = new Set([
    "contractVersion",
    "snapshotId",
    "snapshotDigest",
    "producerVersion",
    "ownerScopeDigest",
    "producedAt",
    "validThrough",
    "maxAgeMs",
    "watermark",
    "meetings",
    "privacy",
]);
const WATERMARK_KEYS = new Set(["kind", "valueDigest", "observedThrough"]);
const MEETING_KEYS = new Set([
    "canonicalMeetingId",
    "primarySourceIdentityDigest",
    "sourceVariants",
    "evidence",
]);
const VARIANT_KEYS = new Set([
    "sourceVariantRefDigest",
    "sourceKind",
    "role",
    "bindingDigest",
    "sourceObjectDigest",
    "sourceRevisionDigest",
    "contentDigest",
    "sourceIdentityDigest",
    "authority",
    "modifiedAt",
    "eventTime",
    "observedAt",
]);
const EVIDENCE_REQUIRED_KEYS = new Set([
    "evidenceId",
    "evidenceDigest",
    "canonicalMeetingId",
    "kind",
    "recordKind",
    "activity",
    "occurredAt",
    "observedAt",
    "objectRefs",
    "title",
    "summary",
    "authority",
    "quality",
    "coverage",
    "confidence",
    "status",
    "deadline",
    "proposalDisposition",
    "statementReferenceDigest",
    "supportingSourceVariantRefDigests",
]);
const EVIDENCE_KEYS = new Set([
    ...EVIDENCE_REQUIRED_KEYS,
    "speechActClass",
    "speechActActor",
    "mentionIdentityDigest",
    "extractionEnvelopeDigest",
    "promotionEligible",
]);
const OBJECT_REF_KEYS = new Set(["kind", "referenceDigest"]);
const PRIVACY_KEYS = new Set([
    "sourceBodiesStored",
    "transcriptBodiesStored",
    "emailContentStored",
    "participantDetailsStored",
    "credentialsStored",
    "localPathsStored",
]);
const RESULT_KEYS = new Set([
    "contractVersion",
    "resultId",
    "resultDigest",
    "producerVersion",
    "availability",
    "freshness",
    "reasonDetailDigest",
    "snapshot",
    "retainedLastGood",
    "privacy",
]);
const FRESHNESS_KEYS = new Set([
    "decision",
    "interval",
    "assessedAt",
    "producedAt",
    "validThrough",
    "ageMs",
    "maxAgeMs",
    "currentSemanticInputEligible",
]);
const LAST_GOOD_KEYS = new Set([
    "snapshotId",
    "snapshotDigest",
    "producedAt",
    "validThrough",
]);
const RETAINED_KEYS = new Set([
    ...LAST_GOOD_KEYS,
    "retainedBecause",
    "eligibleForCurrentSemanticInput",
]);
const BINDING_KEYS = new Set([
    "connectionId",
    "sourceKind",
    "tenantOrWorkspaceDigest",
    "accountOrPrincipalDigest",
    "grantVersion",
]);
const EVIDENCE_DRAFT_KEYS = new Set([
    "kind",
    "title",
    "summary",
    "occurredAt",
    "observedAt",
    "status",
    "deadline",
    "quality",
    "coverage",
    "confidence",
    "objectRefs",
    "speechActClass",
    "speechActActor",
    "mentionIdentityDigest",
    "extractionEnvelopeDigest",
]);
const PRIMARY_DRAFT_KEYS = new Set([
    "binding",
    "documentId",
    "revisionId",
    "contentDigest",
    "modifiedAt",
    "eventTime",
    "observedAt",
    "evidence",
    "secondaryVariants",
]);
const SECONDARY_DRAFT_KEYS = new Set([
    "binding",
    "sourceObjectId",
    "sourceVersion",
    "contentDigest",
    "modifiedAt",
    "eventTime",
    "observedAt",
    "evidence",
]);
const SNAPSHOT_DRAFT_KEYS = new Set([
    "ownerScopeDigest",
    "producerVersion",
    "producedAt",
    "meetings",
]);
const VALID_KINDS = new Set([
    "decision",
    "action_item",
    "commitment",
]);
const VALID_STATUSES = new Set([
    "proposed",
    "open",
    "in_progress",
    "done",
    "cancelled",
    "unknown",
]);
const VALID_QUALITIES = new Set([
    "source_native",
    "structured_generated",
    "provider_summary",
    "degraded_summary",
    "bounded_context",
]);
const VALID_COVERAGE = new Set([
    "complete",
    "partial",
]);
const VALID_SPEECH_ACT_CLASSES = new Set([
    "request",
    "commitment",
    "decision",
    "other",
]);
const VALID_SPEECH_ACT_ACTORS = new Set([
    "self",
    "other",
    "unknown",
]);
const VALID_REF_KINDS = new Set([
    "canonical_meeting",
    "source_object",
    "external_reference",
]);
const VALID_DECISIONS = new Set([
    "fresh",
    "boundary_due",
    "stale",
    "missing",
    "unknown_version",
    "malformed",
]);
function stableId(prefix, value) {
    return `${prefix}_${(0, source_contracts_js_1.taskMapContractDigest)(value).slice(0, 16)}`;
}
function deepFreeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) {
            deepFreeze(child);
        }
        Object.freeze(value);
    }
    return value;
}
function assertPlainObject(value, label) {
    if (value === null
        || typeof value !== "object"
        || Array.isArray(value)
        || (Object.getPrototypeOf(value) !== Object.prototype
            && Object.getPrototypeOf(value) !== null)) {
        throw new Error(`${label} must be a plain object`);
    }
}
function assertClosedKeys(value, allowed, required, label) {
    for (const key of Object.keys(value)) {
        if (!allowed.has(key))
            throw new Error(`${label} has an unsupported key`);
    }
    for (const key of required) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) {
            throw new Error(`${label} is missing a required key`);
        }
    }
}
function assertDigest(value, label) {
    if (typeof value !== "string" || !SHA256.test(value)) {
        throw new Error(`${label} must be a sha256 digest`);
    }
}
function assertStableId(value, label) {
    if (typeof value !== "string" || !STABLE_ID.test(value)) {
        throw new Error(`${label} must be a stable identifier`);
    }
}
function canonicalTimestamp(value, label) {
    if (typeof value !== "string"
        || value.length > 64
        || !STRICT_RFC3339.test(value)) {
        throw new Error(`${label} must be an RFC3339 timestamp`);
    }
    const milliseconds = Date.parse(value);
    if (!Number.isFinite(milliseconds)) {
        throw new Error(`${label} must be an RFC3339 timestamp`);
    }
    return new Date(milliseconds).toISOString();
}
function assertCanonicalTimestamp(value, label) {
    if (typeof value !== "string"
        || canonicalTimestamp(value, label) !== value) {
        throw new Error(`${label} must be a canonical RFC3339 timestamp`);
    }
}
function assertOpaque(value, label) {
    if (typeof value !== "string"
        || value.length === 0
        || Buffer.byteLength(value, "utf8")
            > exports.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxOpaqueBytes
        || CONTROL_CHARACTER.test(value)) {
        throw new Error(`${label} must be a bounded opaque string`);
    }
}
function boundedSemanticText(value, maxCharacters, label) {
    if (typeof value !== "string")
        throw new Error(`${label} must be a string`);
    const normalized = (0, text_contract_js_1.toWellFormedText)(value).trim().replace(/\s+/gu, " ");
    if (normalized.length === 0
        || CONTROL_CHARACTER.test(normalized)) {
        throw new Error(`${label} exceeds its semantic evidence bound`);
    }
    assertSemanticTextPrivacy(normalized, label);
    return (0, text_contract_js_1.boundedUtf16)(normalized, maxCharacters);
}
function assertSemanticTextPrivacy(value, label) {
    if (EMAIL_ADDRESS.test(value)
        || CREDENTIAL_ASSIGNMENT.test(value)
        || BEARER_SECRET.test(value)
        || PROVIDER_TOKEN.test(value)
        || JWT_SECRET.test(value)
        || LOCAL_FILE_URI.test(value)
        || OWNER_LOCAL_ABSOLUTE_PATH.test(value)) {
        throw new Error(`${label} violates the semantic privacy boundary`);
    }
}
function assertBoundedSemanticText(value, maxCharacters, label) {
    if (typeof value !== "string"
        || value !== value.trim().replace(/\s+/gu, " ")
        || value.length === 0
        || value.length > maxCharacters
        || (0, text_contract_js_1.toWellFormedText)(value) !== value
        || CONTROL_CHARACTER.test(value)) {
        throw new Error(`${label} is not canonical bounded semantic evidence`);
    }
    assertSemanticTextPrivacy(value, label);
}
function assertBinding(value, expectedSourceKind, label) {
    assertPlainObject(value, label);
    assertClosedKeys(value, BINDING_KEYS, BINDING_KEYS, label);
    assertOpaque(value.connectionId, `${label}.connectionId`);
    if (value.sourceKind !== expectedSourceKind) {
        throw new Error(`${label}.sourceKind must be ${expectedSourceKind}`);
    }
    assertDigest(value.tenantOrWorkspaceDigest, `${label}.tenantOrWorkspaceDigest`);
    assertDigest(value.accountOrPrincipalDigest, `${label}.accountOrPrincipalDigest`);
    assertOpaque(value.grantVersion, `${label}.grantVersion`);
}
function assertObjectRef(value, label) {
    assertPlainObject(value, label);
    assertClosedKeys(value, OBJECT_REF_KEYS, OBJECT_REF_KEYS, label);
    if (typeof value.kind !== "string"
        || !VALID_REF_KINDS.has(value.kind)) {
        throw new Error(`${label}.kind is invalid`);
    }
    assertDigest(value.referenceDigest, `${label}.referenceDigest`);
}
function normalizeObjectRefs(value, label) {
    if (value === undefined)
        return [];
    if (!Array.isArray(value))
        throw new Error(`${label} must be an array`);
    if (value.length > exports.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxObjectRefsPerEvidence) {
        throw new Error(`${label} exceeds its limit`);
    }
    const refs = value.map((item, index) => {
        assertObjectRef(item, `${label}[${index}]`);
        if (item.kind !== "external_reference") {
            throw new Error(`${label} may only add external_reference digests`);
        }
        return {
            kind: item.kind,
            referenceDigest: item.referenceDigest,
        };
    });
    return sortAndDedupeObjectRefs(refs);
}
function sortAndDedupeObjectRefs(refs) {
    const map = new Map();
    for (const ref of refs)
        map.set(`${ref.kind}:${ref.referenceDigest}`, ref);
    return [...map.values()].sort((left, right) => left.kind.localeCompare(right.kind)
        || left.referenceDigest.localeCompare(right.referenceDigest));
}
const SPEECH_ACT_PROVENANCE_KEYS = [
    "speechActClass",
    "speechActActor",
    "mentionIdentityDigest",
    "extractionEnvelopeDigest",
];
function validatedSpeechActProvenance(value, label) {
    const presentCount = SPEECH_ACT_PROVENANCE_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(value, key)).length;
    if (presentCount === 0)
        return undefined;
    if (presentCount !== SPEECH_ACT_PROVENANCE_KEYS.length) {
        throw new Error(`${label} speech-act provenance must be all-or-none`);
    }
    if (!Object.prototype.hasOwnProperty.call(value, "confidence")) {
        throw new Error(`${label} speech-act provenance requires explicit confidence`);
    }
    if (typeof value.speechActClass !== "string"
        || !VALID_SPEECH_ACT_CLASSES.has(value.speechActClass)) {
        throw new Error(`${label}.speechActClass is invalid`);
    }
    if (typeof value.speechActActor !== "string"
        || !VALID_SPEECH_ACT_ACTORS.has(value.speechActActor)) {
        throw new Error(`${label}.speechActActor is invalid`);
    }
    assertDigest(value.mentionIdentityDigest, `${label}.mentionIdentityDigest`);
    assertDigest(value.extractionEnvelopeDigest, `${label}.extractionEnvelopeDigest`);
    return {
        speechActClass: value.speechActClass,
        speechActActor: value.speechActActor,
        mentionIdentityDigest: value.mentionIdentityDigest,
        extractionEnvelopeDigest: value.extractionEnvelopeDigest,
    };
}
function validatedPromotionEligibility(value, provenance, label) {
    const hasEligibility = Object.prototype.hasOwnProperty.call(value, "promotionEligible");
    if (provenance === undefined) {
        if (hasEligibility) {
            throw new Error(`${label}.promotionEligible requires speech-act provenance`);
        }
        return undefined;
    }
    if (!hasEligibility || typeof value.promotionEligible !== "boolean") {
        throw new Error(`${label}.promotionEligible must be a derived boolean`);
    }
    const expected = taskMapMeetingObligationGate(provenance.speechActClass, provenance.speechActActor).promotionEligible;
    if (value.promotionEligible !== expected) {
        throw new Error(`${label}.promotionEligible is inconsistent`);
    }
    return value.promotionEligible;
}
function speechActEvidenceKind(speechActClass) {
    switch (speechActClass) {
        case "request":
        case "other":
            return "action_item";
        case "commitment":
            return "commitment";
        case "decision":
            return "decision";
    }
    const exhaustive = speechActClass;
    return exhaustive;
}
function assertSpeechActKind(kind, provenance, label) {
    if (provenance !== undefined
        && kind !== speechActEvidenceKind(provenance.speechActClass)) {
        throw new Error(`${label} speech-act class is inconsistent with kind`);
    }
}
function unreachableSpeechAct(value) {
    throw new Error(`unreachable speech-act value: ${String(value)}`);
}
function taskMapMeetingObligationGate(speechActClass, speechActActor) {
    switch (speechActClass) {
        case "request":
            switch (speechActActor) {
                case "self":
                    return {
                        authority: "explicit_commitment",
                        proposalDisposition: "candidate_only",
                        promotionEligible: true,
                    };
                case "other":
                    return {
                        authority: "provider_generated_summary",
                        proposalDisposition: "candidate_only",
                        promotionEligible: false,
                    };
                case "unknown":
                    return {
                        authority: "provider_generated_summary",
                        proposalDisposition: "candidate_only",
                        promotionEligible: false,
                    };
            }
            return unreachableSpeechAct(speechActActor);
        case "commitment":
            switch (speechActActor) {
                case "self":
                    return {
                        authority: "explicit_commitment",
                        proposalDisposition: "candidate_only",
                        promotionEligible: true,
                    };
                case "other":
                    return {
                        authority: "provider_generated_summary",
                        proposalDisposition: "candidate_only",
                        promotionEligible: false,
                    };
                case "unknown":
                    return {
                        authority: "provider_generated_summary",
                        proposalDisposition: "candidate_only",
                        promotionEligible: false,
                    };
            }
            return unreachableSpeechAct(speechActActor);
        case "decision":
            switch (speechActActor) {
                case "self":
                    return {
                        authority: "context_only",
                        proposalDisposition: "context_only",
                        promotionEligible: false,
                    };
                case "other":
                    return {
                        authority: "context_only",
                        proposalDisposition: "context_only",
                        promotionEligible: false,
                    };
                case "unknown":
                    return {
                        authority: "context_only",
                        proposalDisposition: "context_only",
                        promotionEligible: false,
                    };
            }
            return unreachableSpeechAct(speechActActor);
        case "other":
            switch (speechActActor) {
                case "self":
                    return {
                        authority: "provider_generated_summary",
                        proposalDisposition: "candidate_only",
                        promotionEligible: false,
                    };
                case "other":
                    return {
                        authority: "provider_generated_summary",
                        proposalDisposition: "candidate_only",
                        promotionEligible: false,
                    };
                case "unknown":
                    return {
                        authority: "provider_generated_summary",
                        proposalDisposition: "candidate_only",
                        promotionEligible: false,
                    };
            }
            return unreachableSpeechAct(speechActActor);
    }
    return unreachableSpeechAct(speechActClass);
}
function normalizeEvidenceDraft(value, defaultQuality, label) {
    assertPlainObject(value, label);
    assertClosedKeys(value, EVIDENCE_DRAFT_KEYS, new Set([
        "kind",
        "title",
        "summary",
        "occurredAt",
        "observedAt",
    ]), label);
    if (typeof value.kind !== "string"
        || !VALID_KINDS.has(value.kind)) {
        throw new Error(`${label}.kind is invalid`);
    }
    const status = value.status === undefined ? null : value.status;
    if (status !== null
        && (typeof status !== "string"
            || !VALID_STATUSES.has(status))) {
        throw new Error(`${label}.status is invalid`);
    }
    const quality = value.quality === undefined ? defaultQuality : value.quality;
    if (typeof quality !== "string"
        || !VALID_QUALITIES.has(quality)) {
        throw new Error(`${label}.quality is invalid`);
    }
    const coverage = value.coverage === undefined ? "partial" : value.coverage;
    if (typeof coverage !== "string"
        || !VALID_COVERAGE.has(coverage)) {
        throw new Error(`${label}.coverage is invalid`);
    }
    const speechActProvenance = validatedSpeechActProvenance(value, label);
    const confidence = value.confidence === undefined
        && speechActProvenance === undefined
        ? 0.5
        : value.confidence;
    if (typeof confidence !== "number"
        || !Number.isFinite(confidence)
        || confidence < 0
        || confidence > 1) {
        throw new Error(`${label}.confidence must be between zero and one`);
    }
    const deadline = value.deadline === undefined
        ? null
        : canonicalTimestamp(value.deadline, `${label}.deadline`);
    assertSpeechActKind(value.kind, speechActProvenance, label);
    return {
        kind: value.kind,
        title: boundedSemanticText(value.title, exports.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxTitleCharacters, `${label}.title`),
        summary: boundedSemanticText(value.summary, exports.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxSummaryCharacters, `${label}.summary`),
        occurredAt: canonicalTimestamp(value.occurredAt, `${label}.occurredAt`),
        observedAt: canonicalTimestamp(value.observedAt, `${label}.observedAt`),
        status: status,
        deadline,
        quality: quality,
        coverage: coverage,
        confidence,
        objectRefs: normalizeObjectRefs(value.objectRefs, `${label}.objectRefs`),
        ...(speechActProvenance ?? {}),
    };
}
function evidenceAuthority(kind) {
    if (kind === "decision")
        return "context_only";
    if (kind === "commitment")
        return "explicit_commitment";
    return "provider_generated_summary";
}
function evidenceActivity(kind) {
    if (kind === "decision")
        return "meeting_decision";
    if (kind === "commitment")
        return "meeting_commitment";
    return "meeting_action_item";
}
function qualityRank(quality) {
    return [
        "degraded_summary",
        "bounded_context",
        "provider_summary",
        "structured_generated",
        "source_native",
    ].indexOf(quality);
}
function taskMapMeetingStatementReferenceDigest(input) {
    assertPlainObject(input, "meeting statement reference input");
    const requiredInputKeys = new Set([
        "kind",
        "title",
        "summary",
        "explicitExternalReferenceDigests",
    ]);
    const inputKeys = new Set([
        ...requiredInputKeys,
        "mentionIdentityDigest",
    ]);
    assertClosedKeys(input, inputKeys, requiredInputKeys, "meeting statement reference input");
    if (input.kind !== "action_item"
        && input.kind !== "commitment"
        && input.kind !== "decision") {
        throw new Error("meeting statement reference kind is invalid");
    }
    if (input.kind === "decision" && input.mentionIdentityDigest === undefined) {
        throw new Error("meeting decision statement references require mention identity");
    }
    assertBoundedSemanticText(input.title, exports.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxTitleCharacters, "meeting statement reference title");
    assertBoundedSemanticText(input.summary, exports.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxSummaryCharacters, "meeting statement reference summary");
    if (!Array.isArray(input.explicitExternalReferenceDigests)
        || input.explicitExternalReferenceDigests.length
            > exports.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxObjectRefsPerEvidence) {
        throw new Error("explicit external reference digests exceed their limit");
    }
    input.explicitExternalReferenceDigests.forEach((digest, index) => assertDigest(digest, `explicitExternalReferenceDigests[${index}]`));
    const explicitExternalReferenceDigests = [
        ...new Set(input.explicitExternalReferenceDigests),
    ].sort();
    if (input.mentionIdentityDigest !== undefined) {
        assertDigest(input.mentionIdentityDigest, "meeting statement reference mentionIdentityDigest");
        return (0, source_contracts_js_1.taskMapContractDigest)({
            domain: exports.TASKMAP_MEETING_NORMALIZED_STATEMENT_REFERENCE_DOMAIN,
            kind: input.kind,
            mentionIdentityDigest: input.mentionIdentityDigest,
            explicitExternalReferenceDigests,
        });
    }
    return (0, source_contracts_js_1.taskMapContractDigest)({
        domain: exports.TASKMAP_MEETING_STATEMENT_REFERENCE_DOMAIN,
        kind: input.kind,
        title: input.title,
        summary: input.summary,
        explicitExternalReferenceDigests,
    });
}
function buildVariant(input, sourceKind, role, producedAt, label) {
    assertBinding(input.binding, sourceKind, `${label}.binding`);
    assertOpaque(input.sourceObjectId, `${label}.sourceObjectId`);
    assertOpaque(input.sourceVersion, `${label}.sourceVersion`);
    assertDigest(input.contentDigest, `${label}.contentDigest`);
    const modifiedAt = canonicalTimestamp(input.modifiedAt, `${label}.modifiedAt`);
    const eventTime = canonicalTimestamp(input.eventTime, `${label}.eventTime`);
    const observedAt = canonicalTimestamp(input.observedAt, `${label}.observedAt`);
    if (Date.parse(modifiedAt) > Date.parse(observedAt)
        || Date.parse(eventTime) > Date.parse(observedAt)
        || Date.parse(observedAt) > Date.parse(producedAt)) {
        throw new Error(`${label} source times are inconsistent`);
    }
    if (!Array.isArray(input.evidence)) {
        throw new Error(`${label}.evidence must be an array`);
    }
    if (input.evidence.length
        > exports.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxEvidencePerVariant) {
        throw new Error(`${label}.evidence exceeds its limit`);
    }
    const bindingDigest = (0, source_contracts_js_1.taskMapContractDigest)(input.binding);
    const sourceObjectDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        sourceKind,
        sourceObjectId: input.sourceObjectId,
    });
    const sourceRevisionDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        sourceKind,
        sourceVersion: input.sourceVersion,
    });
    const sourceIdentityDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        bindingDigest,
        sourceKind,
        sourceObjectId: input.sourceObjectId,
        sourceVersion: input.sourceVersion,
    });
    const sourceVariantRefDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        sourceIdentityDigest,
        contentDigest: input.contentDigest,
    });
    return {
        variant: {
            sourceVariantRefDigest,
            sourceKind,
            role,
            bindingDigest,
            sourceObjectDigest,
            sourceRevisionDigest,
            contentDigest: input.contentDigest,
            sourceIdentityDigest,
            authority: sourceKind === "gemini_meet"
                ? "provider_generated_summary"
                : "context_only",
            modifiedAt,
            eventTime,
            observedAt,
        },
        evidence: input.evidence.map((item, index) => {
            const normalized = normalizeEvidenceDraft(item, sourceKind === "gemini_meet"
                ? "structured_generated"
                : "provider_summary", `${label}.evidence[${index}]`);
            if (Date.parse(normalized.occurredAt) > Date.parse(normalized.observedAt)
                || Date.parse(normalized.observedAt) > Date.parse(producedAt)) {
                throw new Error(`${label}.evidence[${index}] times are inconsistent`);
            }
            return normalized;
        }),
    };
}
function buildEvidenceRows(canonicalMeetingId, variants) {
    const rows = new Map();
    for (const { variant, evidence } of variants) {
        for (const draft of evidence) {
            const speechActProvenance = draft.mentionIdentityDigest === undefined
                ? undefined
                : {
                    speechActClass: draft.speechActClass,
                    speechActActor: draft.speechActActor,
                    mentionIdentityDigest: draft.mentionIdentityDigest,
                    extractionEnvelopeDigest: draft.extractionEnvelopeDigest,
                };
            const obligation = speechActProvenance === undefined
                ? {
                    authority: evidenceAuthority(draft.kind),
                    proposalDisposition: draft.kind === "decision"
                        ? "context_only"
                        : "candidate_only",
                    promotionEligible: false,
                }
                : taskMapMeetingObligationGate(speechActProvenance.speechActClass, speechActProvenance.speechActActor);
            const semanticStatement = {
                kind: draft.kind,
                title: draft.title,
                summary: draft.summary,
                status: draft.status,
                deadline: draft.deadline,
            };
            const statementReferenceDigest = draft.kind === "decision"
                && speechActProvenance === undefined
                ? null
                : taskMapMeetingStatementReferenceDigest({
                    kind: draft.kind,
                    title: draft.title,
                    summary: draft.summary,
                    explicitExternalReferenceDigests: draft.objectRefs.map((ref) => ref.referenceDigest),
                    ...(speechActProvenance === undefined
                        ? {}
                        : {
                            mentionIdentityDigest: speechActProvenance.mentionIdentityDigest,
                        }),
                });
            const externalObjectRefs = sortAndDedupeObjectRefs([
                ...draft.objectRefs,
                ...(statementReferenceDigest === null ? [] : [{
                        kind: "external_reference",
                        referenceDigest: statementReferenceDigest,
                    }]),
            ]);
            const legacySemanticIdentity = {
                ...semanticStatement,
                externalObjectRefs,
            };
            const semanticIdentity = speechActProvenance === undefined
                ? legacySemanticIdentity
                : {
                    ...legacySemanticIdentity,
                    ...speechActProvenance,
                    promotionEligible: obligation.promotionEligible,
                };
            const evidenceDigest = (0, source_contracts_js_1.taskMapContractDigest)(semanticIdentity);
            const existing = rows.get(evidenceDigest);
            const objectRefs = sortAndDedupeObjectRefs([
                {
                    kind: "canonical_meeting",
                    referenceDigest: (0, source_contracts_js_1.taskMapContractDigest)(canonicalMeetingId),
                },
                {
                    kind: "source_object",
                    referenceDigest: variant.sourceObjectDigest,
                },
                ...externalObjectRefs,
                ...(existing?.objectRefs ?? []),
            ]);
            if (objectRefs.length
                > exports.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxObjectRefsPerEvidence) {
                throw new Error("deduped evidence objectRefs exceed their limit");
            }
            const supportRefs = [
                ...(existing?.supportingSourceVariantRefDigests ?? []),
                variant.sourceVariantRefDigest,
            ].sort().filter((item, index, values) => index === 0 || item !== values[index - 1]);
            if (existing === undefined) {
                rows.set(evidenceDigest, {
                    evidenceId: stableId("tmpe", {
                        canonicalMeetingId,
                        evidenceDigest,
                    }),
                    evidenceDigest,
                    canonicalMeetingId,
                    kind: draft.kind,
                    recordKind: "work_context",
                    activity: evidenceActivity(draft.kind),
                    occurredAt: draft.occurredAt,
                    observedAt: draft.observedAt,
                    objectRefs,
                    title: draft.title,
                    summary: draft.summary,
                    authority: obligation.authority,
                    quality: draft.quality,
                    coverage: draft.coverage,
                    confidence: draft.confidence,
                    status: draft.status,
                    deadline: draft.deadline,
                    proposalDisposition: obligation.proposalDisposition,
                    statementReferenceDigest,
                    supportingSourceVariantRefDigests: supportRefs,
                    ...(speechActProvenance === undefined
                        ? {}
                        : {
                            ...speechActProvenance,
                            promotionEligible: obligation.promotionEligible,
                        }),
                });
            }
            else {
                rows.set(evidenceDigest, {
                    ...existing,
                    occurredAt: Date.parse(draft.occurredAt)
                        < Date.parse(existing.occurredAt)
                        ? draft.occurredAt
                        : existing.occurredAt,
                    observedAt: Date.parse(draft.observedAt)
                        > Date.parse(existing.observedAt)
                        ? draft.observedAt
                        : existing.observedAt,
                    objectRefs,
                    quality: qualityRank(draft.quality) > qualityRank(existing.quality)
                        ? draft.quality
                        : existing.quality,
                    coverage: existing.coverage === "complete" || draft.coverage === "complete"
                        ? "complete"
                        : "partial",
                    confidence: Math.max(existing.confidence, draft.confidence),
                    supportingSourceVariantRefDigests: supportRefs,
                });
            }
        }
    }
    return [...rows.values()].sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
}
function snapshotPayload(snapshot) {
    return snapshot;
}
function buildTaskMapMeetingProducerSnapshot(input) {
    assertPlainObject(input, "meeting producer snapshot draft");
    assertClosedKeys(input, SNAPSHOT_DRAFT_KEYS, new Set(["ownerScopeDigest", "producedAt", "meetings"]), "meeting producer snapshot draft");
    assertDigest(input.ownerScopeDigest, "ownerScopeDigest");
    if (input.producerVersion !== undefined
        && input.producerVersion !== exports.TASKMAP_MEETING_PRODUCER_VERSION) {
        throw new Error("producerVersion is unsupported");
    }
    const producedAt = canonicalTimestamp(input.producedAt, "producedAt");
    if (!Array.isArray(input.meetings))
        throw new Error("meetings must be an array");
    if (input.meetings.length > exports.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxMeetings) {
        throw new Error("meetings exceed their producer observation limit");
    }
    let inputEvidenceCount = 0;
    const meetings = input.meetings.map((meeting, meetingIndex) => {
        const label = `meetings[${meetingIndex}]`;
        assertPlainObject(meeting, label);
        assertClosedKeys(meeting, PRIMARY_DRAFT_KEYS, new Set([
            "binding",
            "documentId",
            "revisionId",
            "contentDigest",
            "modifiedAt",
            "eventTime",
            "observedAt",
            "evidence",
        ]), label);
        const primary = buildVariant({
            binding: meeting.binding,
            sourceObjectId: meeting.documentId,
            sourceVersion: meeting.revisionId,
            contentDigest: meeting.contentDigest,
            modifiedAt: meeting.modifiedAt,
            eventTime: meeting.eventTime,
            observedAt: meeting.observedAt,
            evidence: meeting.evidence,
        }, "gemini_meet", "primary", producedAt, label);
        const secondaryDrafts = meeting.secondaryVariants ?? [];
        if (!Array.isArray(secondaryDrafts)) {
            throw new Error(`${label}.secondaryVariants must be an array`);
        }
        if (secondaryDrafts.length + 1
            > exports.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxVariantsPerMeeting) {
            throw new Error(`${label}.secondaryVariants exceed their limit`);
        }
        const secondaries = secondaryDrafts.map((secondary, variantIndex) => {
            const secondaryLabel = `${label}.secondaryVariants[${variantIndex}]`;
            assertPlainObject(secondary, secondaryLabel);
            assertClosedKeys(secondary, SECONDARY_DRAFT_KEYS, SECONDARY_DRAFT_KEYS, secondaryLabel);
            return buildVariant({
                binding: secondary.binding,
                sourceObjectId: secondary.sourceObjectId,
                sourceVersion: secondary.sourceVersion,
                contentDigest: secondary.contentDigest,
                modifiedAt: secondary.modifiedAt,
                eventTime: secondary.eventTime,
                observedAt: secondary.observedAt,
                evidence: secondary.evidence,
            }, "granola", "secondary", producedAt, secondaryLabel);
        });
        inputEvidenceCount += primary.evidence.length
            + secondaries.reduce((count, item) => count + item.evidence.length, 0);
        const variantsByRef = new Map();
        for (const variant of [primary, ...secondaries]) {
            const previous = variantsByRef.get(variant.variant.sourceVariantRefDigest);
            if (previous === undefined) {
                variantsByRef.set(variant.variant.sourceVariantRefDigest, variant);
            }
            else {
                variantsByRef.set(variant.variant.sourceVariantRefDigest, {
                    variant: previous.variant,
                    evidence: [...previous.evidence, ...variant.evidence],
                });
            }
        }
        const allVariants = [...variantsByRef.values()].sort((left, right) => (left.variant.role === "primary" ? 0 : 1)
            - (right.variant.role === "primary" ? 0 : 1)
            || left.variant.sourceVariantRefDigest.localeCompare(right.variant.sourceVariantRefDigest));
        const canonicalMeetingId = stableId("tmpm", {
            ownerScopeDigest: input.ownerScopeDigest,
            primarySourceObjectDigest: primary.variant.sourceObjectDigest,
        });
        return {
            canonicalMeetingId,
            primarySourceIdentityDigest: primary.variant.sourceIdentityDigest,
            sourceVariants: allVariants.map((item) => item.variant),
            evidence: buildEvidenceRows(canonicalMeetingId, allVariants),
        };
    });
    if (inputEvidenceCount > exports.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxEvidenceGlobal) {
        throw new Error("semantic evidence exceeds the global limit");
    }
    const meetingsById = new Map();
    for (const meeting of meetings) {
        if (meetingsById.has(meeting.canonicalMeetingId)) {
            throw new Error("duplicate Gemini document meeting");
        }
        meetingsById.set(meeting.canonicalMeetingId, meeting);
    }
    const sortedMeetings = [...meetingsById.values()].sort((left, right) => left.canonicalMeetingId.localeCompare(right.canonicalMeetingId));
    const outputEvidenceCount = sortedMeetings.reduce((count, meeting) => count + meeting.evidence.length, 0);
    if (outputEvidenceCount > exports.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxEvidenceGlobal) {
        throw new Error("deduped semantic evidence exceeds the global limit");
    }
    const observedTimes = sortedMeetings.flatMap((meeting) => meeting.sourceVariants.map((variant) => variant.observedAt));
    const observedThrough = observedTimes.length === 0
        ? producedAt
        : observedTimes.reduce((latest, timestamp) => Date.parse(timestamp) > Date.parse(latest) ? timestamp : latest);
    const validThrough = new Date(Date.parse(producedAt) + exports.TASKMAP_MEETING_PRODUCER_MAX_AGE_MS).toISOString();
    const base = snapshotPayload({
        contractVersion: exports.TASKMAP_MEETING_PRODUCER_SNAPSHOT_VERSION,
        producerVersion: exports.TASKMAP_MEETING_PRODUCER_VERSION,
        ownerScopeDigest: input.ownerScopeDigest,
        producedAt,
        validThrough,
        maxAgeMs: exports.TASKMAP_MEETING_PRODUCER_MAX_AGE_MS,
        watermark: {
            kind: "revision_content",
            valueDigest: (0, source_contracts_js_1.taskMapContractDigest)(sortedMeetings.flatMap((meeting) => meeting.sourceVariants.map((variant) => ({
                sourceIdentityDigest: variant.sourceIdentityDigest,
                contentDigest: variant.contentDigest,
            })))),
            observedThrough,
        },
        meetings: sortedMeetings,
        privacy: PRIVACY,
    });
    const snapshotDigest = (0, source_contracts_js_1.taskMapContractDigest)(base);
    const snapshot = {
        ...base,
        snapshotId: stableId("tmps", snapshotDigest),
        snapshotDigest,
    };
    if (Buffer.byteLength(JSON.stringify(snapshot), "utf8")
        > exports.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxFileBytes) {
        throw new Error("meeting producer snapshot exceeds its byte limit");
    }
    assertTaskMapMeetingProducerSnapshot(snapshot);
    return deepFreeze(snapshot);
}
function assertPrivacy(value, label) {
    assertPlainObject(value, label);
    assertClosedKeys(value, PRIVACY_KEYS, PRIVACY_KEYS, label);
    for (const key of PRIVACY_KEYS) {
        if (value[key] !== false)
            throw new Error(`${label}.${key} must be false`);
    }
}
function assertVariant(value, label) {
    assertPlainObject(value, label);
    assertClosedKeys(value, VARIANT_KEYS, VARIANT_KEYS, label);
    assertDigest(value.sourceVariantRefDigest, `${label}.sourceVariantRefDigest`);
    if (value.sourceKind !== "gemini_meet" && value.sourceKind !== "granola") {
        throw new Error(`${label}.sourceKind is invalid`);
    }
    if (value.role !== "primary" && value.role !== "secondary") {
        throw new Error(`${label}.role is invalid`);
    }
    if ((value.role === "primary") !== (value.sourceKind === "gemini_meet")) {
        throw new Error(`${label} has an invalid source role`);
    }
    for (const key of [
        "bindingDigest",
        "sourceObjectDigest",
        "sourceRevisionDigest",
        "contentDigest",
        "sourceIdentityDigest",
    ]) {
        assertDigest(value[key], `${label}.${key}`);
    }
    if (value.authority !== (value.sourceKind === "gemini_meet"
        ? "provider_generated_summary"
        : "context_only")) {
        throw new Error(`${label}.authority is invalid`);
    }
    assertCanonicalTimestamp(value.modifiedAt, `${label}.modifiedAt`);
    assertCanonicalTimestamp(value.eventTime, `${label}.eventTime`);
    assertCanonicalTimestamp(value.observedAt, `${label}.observedAt`);
    if (Date.parse(value.modifiedAt) > Date.parse(value.observedAt)
        || Date.parse(value.eventTime) > Date.parse(value.observedAt)) {
        throw new Error(`${label} source times are inconsistent`);
    }
    if (value.sourceVariantRefDigest !== (0, source_contracts_js_1.taskMapContractDigest)({
        sourceIdentityDigest: value.sourceIdentityDigest,
        contentDigest: value.contentDigest,
    })) {
        throw new Error(`${label}.sourceVariantRefDigest is inconsistent`);
    }
}
function assertEvidence(value, meeting, label) {
    assertPlainObject(value, label);
    assertClosedKeys(value, EVIDENCE_KEYS, EVIDENCE_REQUIRED_KEYS, label);
    const speechActProvenance = validatedSpeechActProvenance(value, label);
    assertStableId(value.evidenceId, `${label}.evidenceId`);
    assertDigest(value.evidenceDigest, `${label}.evidenceDigest`);
    if (value.canonicalMeetingId !== meeting.canonicalMeetingId) {
        throw new Error(`${label}.canonicalMeetingId is inconsistent`);
    }
    if (typeof value.kind !== "string"
        || !VALID_KINDS.has(value.kind)) {
        throw new Error(`${label}.kind is invalid`);
    }
    const kind = value.kind;
    assertSpeechActKind(kind, speechActProvenance, label);
    const promotionEligible = validatedPromotionEligibility(value, speechActProvenance, label);
    const obligation = speechActProvenance === undefined
        ? {
            authority: evidenceAuthority(kind),
            proposalDisposition: kind === "decision"
                ? "context_only"
                : "candidate_only",
            promotionEligible: false,
        }
        : taskMapMeetingObligationGate(speechActProvenance.speechActClass, speechActProvenance.speechActActor);
    if (value.recordKind !== "work_context"
        || value.activity !== evidenceActivity(kind)
        || value.authority !== obligation.authority
        || value.proposalDisposition !== obligation.proposalDisposition) {
        throw new Error(`${label} meeting evidence authority is invalid`);
    }
    assertCanonicalTimestamp(value.occurredAt, `${label}.occurredAt`);
    assertCanonicalTimestamp(value.observedAt, `${label}.observedAt`);
    if (Date.parse(value.occurredAt) > Date.parse(value.observedAt)) {
        throw new Error(`${label} evidence times are inconsistent`);
    }
    assertBoundedSemanticText(value.title, exports.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxTitleCharacters, `${label}.title`);
    assertBoundedSemanticText(value.summary, exports.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxSummaryCharacters, `${label}.summary`);
    const evidenceTitle = value.title;
    const evidenceSummary = value.summary;
    if (typeof value.quality !== "string"
        || !VALID_QUALITIES.has(value.quality)) {
        throw new Error(`${label}.quality is invalid`);
    }
    if (typeof value.coverage !== "string"
        || !VALID_COVERAGE.has(value.coverage)) {
        throw new Error(`${label}.coverage is invalid`);
    }
    if (typeof value.confidence !== "number"
        || !Number.isFinite(value.confidence)
        || value.confidence < 0
        || value.confidence > 1) {
        throw new Error(`${label}.confidence is invalid`);
    }
    if (value.status !== null
        && (typeof value.status !== "string"
            || !VALID_STATUSES.has(value.status))) {
        throw new Error(`${label}.status is invalid`);
    }
    if (value.deadline !== null) {
        assertCanonicalTimestamp(value.deadline, `${label}.deadline`);
    }
    if (!Array.isArray(value.objectRefs)) {
        throw new Error(`${label}.objectRefs must be an array`);
    }
    if (value.objectRefs.length < 2
        || value.objectRefs.length
            > exports.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxObjectRefsPerEvidence) {
        throw new Error(`${label}.objectRefs has an invalid size`);
    }
    value.objectRefs.forEach((item, index) => assertObjectRef(item, `${label}.objectRefs[${index}]`));
    const canonicalRef = (0, source_contracts_js_1.taskMapContractDigest)(meeting.canonicalMeetingId);
    if (!value.objectRefs.some((ref) => ref.kind === "canonical_meeting"
        && ref.referenceDigest === canonicalRef)) {
        throw new Error(`${label} is missing its canonical meeting ref`);
    }
    const sourceObjects = new Set(meeting.sourceVariants.map((variant) => variant.sourceObjectDigest));
    if (!value.objectRefs.some((ref) => ref.kind === "source_object" && sourceObjects.has(ref.referenceDigest))) {
        throw new Error(`${label} is missing its source object ref`);
    }
    const externalObjectRefs = value.objectRefs.filter((ref) => ref.kind === "external_reference");
    if (kind === "decision" && speechActProvenance === undefined) {
        if (value.statementReferenceDigest !== null) {
            throw new Error(`${label} context evidence cannot have a statement ref`);
        }
    }
    else {
        assertDigest(value.statementReferenceDigest, `${label}.statementReferenceDigest`);
        const statementReferenceDigest = value.statementReferenceDigest;
        const expectedStatementReferenceDigest = taskMapMeetingStatementReferenceDigest({
            kind,
            title: evidenceTitle,
            summary: evidenceSummary,
            explicitExternalReferenceDigests: externalObjectRefs
                .filter((candidate) => candidate.referenceDigest !== statementReferenceDigest)
                .map((candidate) => candidate.referenceDigest),
            ...(speechActProvenance === undefined
                ? {}
                : {
                    mentionIdentityDigest: speechActProvenance.mentionIdentityDigest,
                }),
        });
        if (statementReferenceDigest !== expectedStatementReferenceDigest
            || !externalObjectRefs.some((ref) => ref.referenceDigest === statementReferenceDigest)) {
            throw new Error(`${label} candidate evidence has an invalid statement ref`);
        }
    }
    if (!Array.isArray(value.supportingSourceVariantRefDigests)) {
        throw new Error(`${label}.supportingSourceVariantRefDigests must be an array`);
    }
    if (value.supportingSourceVariantRefDigests.length === 0
        || value.supportingSourceVariantRefDigests.length
            > exports.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxVariantsPerMeeting) {
        throw new Error(`${label} has invalid source support`);
    }
    const variantRefs = new Set(meeting.sourceVariants.map((variant) => variant.sourceVariantRefDigest));
    value.supportingSourceVariantRefDigests.forEach((digest, index) => {
        assertDigest(digest, `${label}.supportingSourceVariantRefDigests[${index}]`);
        if (!variantRefs.has(digest)) {
            throw new Error(`${label} references unknown source support`);
        }
    });
    const legacySemanticIdentity = {
        kind,
        title: value.title,
        summary: value.summary,
        status: value.status,
        deadline: value.deadline,
        externalObjectRefs,
    };
    const expectedEvidenceDigest = (0, source_contracts_js_1.taskMapContractDigest)(speechActProvenance === undefined
        ? legacySemanticIdentity
        : {
            ...legacySemanticIdentity,
            ...speechActProvenance,
            promotionEligible,
        });
    if (value.evidenceDigest !== expectedEvidenceDigest
        || value.evidenceId !== stableId("tmpe", {
            canonicalMeetingId: meeting.canonicalMeetingId,
            evidenceDigest: value.evidenceDigest,
        })) {
        throw new Error(`${label} semantic identity is inconsistent`);
    }
}
function assertTaskMapMeetingProducerSnapshot(value) {
    assertPlainObject(value, "meeting producer snapshot");
    assertClosedKeys(value, SNAPSHOT_KEYS, SNAPSHOT_KEYS, "meeting producer snapshot");
    if (value.contractVersion !== exports.TASKMAP_MEETING_PRODUCER_SNAPSHOT_VERSION) {
        throw new Error("meeting producer snapshot contractVersion is unsupported");
    }
    if (value.producerVersion !== exports.TASKMAP_MEETING_PRODUCER_VERSION) {
        throw new Error("meeting producer snapshot producerVersion is unsupported");
    }
    assertStableId(value.snapshotId, "snapshotId");
    assertDigest(value.snapshotDigest, "snapshotDigest");
    assertDigest(value.ownerScopeDigest, "ownerScopeDigest");
    assertCanonicalTimestamp(value.producedAt, "producedAt");
    assertCanonicalTimestamp(value.validThrough, "validThrough");
    const producedAt = value.producedAt;
    if (value.maxAgeMs !== exports.TASKMAP_MEETING_PRODUCER_MAX_AGE_MS
        || Date.parse(value.validThrough) - Date.parse(value.producedAt)
            !== exports.TASKMAP_MEETING_PRODUCER_MAX_AGE_MS) {
        throw new Error("meeting producer snapshot freshness interval is invalid");
    }
    assertPlainObject(value.watermark, "watermark");
    assertClosedKeys(value.watermark, WATERMARK_KEYS, WATERMARK_KEYS, "watermark");
    if (value.watermark.kind !== "revision_content") {
        throw new Error("watermark.kind is invalid");
    }
    assertDigest(value.watermark.valueDigest, "watermark.valueDigest");
    assertCanonicalTimestamp(value.watermark.observedThrough, "watermark.observedThrough");
    if (!Array.isArray(value.meetings))
        throw new Error("meetings must be an array");
    if (value.meetings.length > exports.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxMeetings) {
        throw new Error("meetings exceed their producer observation limit");
    }
    let evidenceCount = 0;
    const meetingIds = new Set();
    const expectedWatermarkRows = [];
    const observedTimes = [];
    value.meetings.forEach((meetingValue, meetingIndex) => {
        const label = `meetings[${meetingIndex}]`;
        assertPlainObject(meetingValue, label);
        assertClosedKeys(meetingValue, MEETING_KEYS, MEETING_KEYS, label);
        assertStableId(meetingValue.canonicalMeetingId, `${label}.canonicalMeetingId`);
        assertDigest(meetingValue.primarySourceIdentityDigest, `${label}.primarySourceIdentityDigest`);
        if (meetingIds.has(meetingValue.canonicalMeetingId)) {
            throw new Error("duplicate canonical meeting");
        }
        meetingIds.add(meetingValue.canonicalMeetingId);
        if (!Array.isArray(meetingValue.sourceVariants)) {
            throw new Error(`${label}.sourceVariants must be an array`);
        }
        if (meetingValue.sourceVariants.length === 0
            || meetingValue.sourceVariants.length
                > exports.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxVariantsPerMeeting) {
            throw new Error(`${label}.sourceVariants has an invalid size`);
        }
        meetingValue.sourceVariants.forEach((variant, variantIndex) => {
            assertVariant(variant, `${label}.sourceVariants[${variantIndex}]`);
            if (Date.parse(variant.observedAt) > Date.parse(producedAt)) {
                throw new Error(`${label} contains a future source observation`);
            }
            expectedWatermarkRows.push({
                sourceIdentityDigest: variant.sourceIdentityDigest,
                contentDigest: variant.contentDigest,
            });
            observedTimes.push(variant.observedAt);
        });
        const primaryVariants = meetingValue.sourceVariants.filter((variant) => variant.role === "primary");
        if (primaryVariants.length !== 1
            || primaryVariants[0].sourceIdentityDigest
                !== meetingValue.primarySourceIdentityDigest) {
            throw new Error(`${label} must have exactly one matching Gemini primary`);
        }
        if (!Array.isArray(meetingValue.evidence)) {
            throw new Error(`${label}.evidence must be an array`);
        }
        const evidenceDigests = new Set();
        meetingValue.evidence.forEach((evidence, evidenceIndex) => {
            assertEvidence(evidence, meetingValue, `${label}.evidence[${evidenceIndex}]`);
            if (evidenceDigests.has(evidence.evidenceDigest)) {
                throw new Error(`${label} contains duplicate semantic evidence`);
            }
            evidenceDigests.add(evidence.evidenceDigest);
        });
        evidenceCount += meetingValue.evidence.length;
    });
    if (evidenceCount > exports.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxEvidenceGlobal) {
        throw new Error("semantic evidence exceeds the global limit");
    }
    if (value.watermark.valueDigest
        !== (0, source_contracts_js_1.taskMapContractDigest)(expectedWatermarkRows)) {
        throw new Error("watermark.valueDigest is inconsistent");
    }
    const expectedObservedThrough = observedTimes.length === 0
        ? value.producedAt
        : observedTimes.reduce((latest, timestamp) => Date.parse(timestamp) > Date.parse(latest) ? timestamp : latest);
    if (value.watermark.observedThrough !== expectedObservedThrough) {
        throw new Error("watermark.observedThrough is inconsistent");
    }
    assertPrivacy(value.privacy, "privacy");
    const { snapshotId, snapshotDigest, ...base } = value;
    const expectedDigest = (0, source_contracts_js_1.taskMapContractDigest)(base);
    if (snapshotDigest !== expectedDigest
        || snapshotId !== stableId("tmps", expectedDigest)) {
        throw new Error("meeting producer snapshot digest is inconsistent");
    }
    if (Buffer.byteLength(JSON.stringify(value), "utf8")
        > exports.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxFileBytes) {
        throw new Error("meeting producer snapshot exceeds its byte limit");
    }
}
function taskMapMeetingProducerLastGoodRef(snapshot) {
    assertTaskMapMeetingProducerSnapshot(snapshot);
    return deepFreeze({
        snapshotId: snapshot.snapshotId,
        snapshotDigest: snapshot.snapshotDigest,
        producedAt: snapshot.producedAt,
        validThrough: snapshot.validThrough,
    });
}
function assertLastGoodRef(value, label) {
    assertPlainObject(value, label);
    assertClosedKeys(value, LAST_GOOD_KEYS, LAST_GOOD_KEYS, label);
    assertStableId(value.snapshotId, `${label}.snapshotId`);
    assertDigest(value.snapshotDigest, `${label}.snapshotDigest`);
    assertCanonicalTimestamp(value.producedAt, `${label}.producedAt`);
    assertCanonicalTimestamp(value.validThrough, `${label}.validThrough`);
    if (Date.parse(value.validThrough) - Date.parse(value.producedAt)
        !== exports.TASKMAP_MEETING_PRODUCER_MAX_AGE_MS) {
        throw new Error(`${label} freshness interval is invalid`);
    }
}
function buildResult(input) {
    const hasValidatedFreshnessInterval = input.decision === "fresh"
        || input.decision === "boundary_due"
        || input.decision === "stale";
    const producedAt = hasValidatedFreshnessInterval
        ? input.snapshot?.producedAt ?? null
        : null;
    const validThrough = hasValidatedFreshnessInterval
        ? input.snapshot?.validThrough ?? null
        : null;
    const ageMs = producedAt === null
        ? null
        : Date.parse(input.assessedAt) - Date.parse(producedAt);
    const retainedSource = input.decision === "fresh"
        ? undefined
        : input.retainedLastGood;
    if (retainedSource !== undefined) {
        assertLastGoodRef(retainedSource, "retainedLastGood");
    }
    const retainedLastGood = retainedSource === undefined
        ? null
        : {
            ...retainedSource,
            retainedBecause: input.decision,
            eligibleForCurrentSemanticInput: false,
        };
    const base = {
        contractVersion: exports.TASKMAP_MEETING_PRODUCER_RESULT_VERSION,
        producerVersion: exports.TASKMAP_MEETING_PRODUCER_VERSION,
        availability: input.decision === "fresh"
            ? "available"
            : "unavailable",
        freshness: {
            decision: input.decision,
            interval: "[producedAt,validThrough)",
            assessedAt: input.assessedAt,
            producedAt,
            validThrough,
            ageMs,
            maxAgeMs: exports.TASKMAP_MEETING_PRODUCER_MAX_AGE_MS,
            currentSemanticInputEligible: input.decision === "fresh",
        },
        reasonDetailDigest: (0, source_contracts_js_1.taskMapContractDigest)({
            decision: input.decision,
            detailCode: input.detailCode,
        }),
        snapshot: input.availableSnapshot ?? null,
        retainedLastGood,
        privacy: PRIVACY,
    };
    const resultDigest = (0, source_contracts_js_1.taskMapContractDigest)(base);
    const result = {
        ...base,
        resultId: stableId("tmpr", resultDigest),
        resultDigest,
    };
    assertTaskMapMeetingProducerResult(result);
    return deepFreeze(result);
}
function isUnknownVersion(value) {
    if (value === null
        || typeof value !== "object"
        || Array.isArray(value)) {
        return false;
    }
    const candidate = value;
    return (typeof candidate.contractVersion === "string"
        && candidate.contractVersion
            !== exports.TASKMAP_MEETING_PRODUCER_SNAPSHOT_VERSION) || (typeof candidate.producerVersion === "string"
        && candidate.producerVersion !== exports.TASKMAP_MEETING_PRODUCER_VERSION);
}
function assessTaskMapMeetingProducerSnapshot(value, assessedAtInput, retainedLastGood) {
    const assessedAt = canonicalTimestamp(assessedAtInput, "assessedAt");
    if (retainedLastGood !== undefined) {
        assertLastGoodRef(retainedLastGood, "retainedLastGood");
    }
    if (isUnknownVersion(value)) {
        return buildResult({
            decision: "unknown_version",
            assessedAt,
            snapshot: null,
            retainedLastGood,
            detailCode: "unsupported_snapshot_or_producer_version",
        });
    }
    try {
        assertTaskMapMeetingProducerSnapshot(value);
    }
    catch {
        return buildResult({
            decision: "malformed",
            assessedAt,
            snapshot: null,
            retainedLastGood,
            detailCode: "snapshot_contract_validation_failed",
        });
    }
    const snapshot = value;
    if (Date.parse(assessedAt) < Date.parse(snapshot.producedAt)) {
        return buildResult({
            decision: "malformed",
            assessedAt,
            snapshot,
            retainedLastGood,
            detailCode: "assessment_precedes_production",
        });
    }
    if (assessedAt === snapshot.validThrough) {
        return buildResult({
            decision: "boundary_due",
            assessedAt,
            snapshot,
            retainedLastGood: taskMapMeetingProducerLastGoodRef(snapshot),
            detailCode: "four_hour_boundary_due",
        });
    }
    if (Date.parse(assessedAt) > Date.parse(snapshot.validThrough)) {
        return buildResult({
            decision: "stale",
            assessedAt,
            snapshot,
            retainedLastGood: taskMapMeetingProducerLastGoodRef(snapshot),
            detailCode: "four_hour_max_age_exceeded",
        });
    }
    return buildResult({
        decision: "fresh",
        assessedAt,
        snapshot,
        availableSnapshot: snapshot,
        detailCode: "within_four_hour_half_open_interval",
    });
}
function unavailableWithoutSnapshot(decision, assessedAtInput, retainedLastGood, detailCode) {
    const assessedAt = canonicalTimestamp(assessedAtInput, "assessedAt");
    return buildResult({
        decision,
        assessedAt,
        snapshot: null,
        retainedLastGood,
        detailCode,
    });
}
function errorCode(value) {
    if (value !== null
        && typeof value === "object"
        && "code" in value
        && typeof value.code === "string") {
        return value.code;
    }
    return undefined;
}
/**
 * Shared trusted owner-scope derivation for the producer and product loader.
 * Callers must supply an established owner ID; there is no implicit fallback.
 */
function taskMapMeetingProducerOwnerScopeDigest(userId) {
    return (0, owner_scope_js_1.taskMapOwnerScopeDigest)(userId);
}
/**
 * Resolves the owner-local producer artifact. The loader still requires the
 * caller to pass this path explicitly, keeping path selection outside parsing.
 */
function taskMapMeetingProducerSnapshotPath(homeDirectory) {
    if (typeof homeDirectory !== "string"
        || homeDirectory.length === 0
        || !node_path_1.default.isAbsolute(homeDirectory)
        || CONTROL_CHARACTER.test(homeDirectory)) {
        throw new Error("homeDirectory must be an absolute local path");
    }
    return node_path_1.default.join(node_path_1.default.normalize(homeDirectory), ".daobrew", "taskmap", "meeting-producer-snapshot.v1.json");
}
/**
 * Authenticated local read only: no provider, connector, network, or write.
 * The returned result never includes the local path.
 */
async function loadTaskMapMeetingProducerResult(input) {
    assertPlainObject(input, "meeting producer load input");
    assertClosedKeys(input, new Set([
        "snapshotPath",
        "assessedAt",
        "expectedOwnerScopeDigest",
        "retainedLastGood",
    ]), new Set(["snapshotPath", "assessedAt"]), "meeting producer load input");
    const assessedAt = canonicalTimestamp(input.assessedAt, "assessedAt");
    if (input.retainedLastGood !== undefined) {
        assertLastGoodRef(input.retainedLastGood, "retainedLastGood");
    }
    if (input.expectedOwnerScopeDigest !== undefined) {
        assertDigest(input.expectedOwnerScopeDigest, "expectedOwnerScopeDigest");
    }
    if (typeof input.snapshotPath !== "string"
        || !node_path_1.default.isAbsolute(input.snapshotPath)
        || node_path_1.default.normalize(input.snapshotPath) !== input.snapshotPath
        || CONTROL_CHARACTER.test(input.snapshotPath)) {
        return unavailableWithoutSnapshot("malformed", assessedAt, input.retainedLastGood, "snapshot_path_invalid");
    }
    let handle;
    try {
        handle = await (0, promises_1.open)(input.snapshotPath, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_NOFOLLOW);
        const before = await handle.stat({ bigint: true });
        const currentUid = typeof process.getuid === "function"
            ? process.getuid()
            : before.uid;
        if (!before.isFile()
            || before.uid !== BigInt(currentUid)
            || (before.mode & 4095n) !== 384n
            || before.nlink !== 1n
            || before.size < 2n
            || before.size > BigInt(exports.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxFileBytes)) {
            return unavailableWithoutSnapshot("malformed", assessedAt, input.retainedLastGood, "snapshot_file_authentication_failed");
        }
        const bytes = await handle.readFile();
        const after = await handle.stat({ bigint: true });
        if (BigInt(bytes.byteLength) !== before.size
            || after.dev !== before.dev
            || after.ino !== before.ino
            || after.size !== before.size
            || after.mode !== before.mode
            || after.nlink !== before.nlink
            || after.uid !== before.uid
            || after.mtimeNs !== before.mtimeNs
            || after.ctimeNs !== before.ctimeNs) {
            return unavailableWithoutSnapshot("malformed", assessedAt, input.retainedLastGood, "snapshot_file_changed_during_read");
        }
        let parsed;
        try {
            parsed = JSON.parse(bytes.toString("utf8"));
        }
        catch {
            return unavailableWithoutSnapshot("malformed", assessedAt, input.retainedLastGood, "snapshot_json_parse_failed");
        }
        if (input.expectedOwnerScopeDigest !== undefined
            && (parsed === null
                || typeof parsed !== "object"
                || Array.isArray(parsed)
                || parsed.ownerScopeDigest
                    !== input.expectedOwnerScopeDigest)) {
            return unavailableWithoutSnapshot("malformed", assessedAt, input.retainedLastGood, "snapshot_owner_scope_mismatch");
        }
        const result = assessTaskMapMeetingProducerSnapshot(parsed, assessedAt, input.retainedLastGood);
        return result;
    }
    catch (error) {
        if (errorCode(error) === "ENOENT") {
            return unavailableWithoutSnapshot("missing", assessedAt, input.retainedLastGood, "snapshot_file_missing");
        }
        return unavailableWithoutSnapshot("malformed", assessedAt, input.retainedLastGood, "snapshot_file_open_failed");
    }
    finally {
        await handle?.close().catch(() => undefined);
    }
}
function assertTaskMapMeetingProducerResult(value) {
    assertPlainObject(value, "meeting producer result");
    assertClosedKeys(value, RESULT_KEYS, RESULT_KEYS, "meeting producer result");
    if (value.contractVersion !== exports.TASKMAP_MEETING_PRODUCER_RESULT_VERSION) {
        throw new Error("meeting producer result contractVersion is unsupported");
    }
    if (value.producerVersion !== exports.TASKMAP_MEETING_PRODUCER_VERSION) {
        throw new Error("meeting producer result producerVersion is unsupported");
    }
    assertStableId(value.resultId, "resultId");
    assertDigest(value.resultDigest, "resultDigest");
    assertDigest(value.reasonDetailDigest, "reasonDetailDigest");
    if (value.availability !== "available" && value.availability !== "unavailable") {
        throw new Error("availability is invalid");
    }
    assertPlainObject(value.freshness, "freshness");
    assertClosedKeys(value.freshness, FRESHNESS_KEYS, FRESHNESS_KEYS, "freshness");
    if (typeof value.freshness.decision !== "string"
        || !VALID_DECISIONS.has(value.freshness.decision)
        || value.freshness.interval !== "[producedAt,validThrough)"
        || value.freshness.maxAgeMs !== exports.TASKMAP_MEETING_PRODUCER_MAX_AGE_MS
        || typeof value.freshness.currentSemanticInputEligible !== "boolean") {
        throw new Error("freshness contract is invalid");
    }
    assertCanonicalTimestamp(value.freshness.assessedAt, "freshness.assessedAt");
    if (value.freshness.producedAt !== null) {
        assertCanonicalTimestamp(value.freshness.producedAt, "freshness.producedAt");
    }
    if (value.freshness.validThrough !== null) {
        assertCanonicalTimestamp(value.freshness.validThrough, "freshness.validThrough");
    }
    if (value.freshness.ageMs !== null
        && (typeof value.freshness.ageMs !== "number"
            || !Number.isFinite(value.freshness.ageMs)
            || value.freshness.ageMs < 0)) {
        throw new Error("freshness.ageMs is invalid");
    }
    const isFresh = value.freshness.decision === "fresh";
    if ((value.availability === "available") !== isFresh
        || value.freshness.currentSemanticInputEligible !== isFresh) {
        throw new Error("freshness availability is inconsistent");
    }
    if (value.snapshot !== null) {
        assertTaskMapMeetingProducerSnapshot(value.snapshot);
    }
    if ((value.snapshot !== null) !== isFresh) {
        throw new Error("only a fresh result may expose the current snapshot");
    }
    if (value.retainedLastGood !== null) {
        assertPlainObject(value.retainedLastGood, "retainedLastGood");
        assertClosedKeys(value.retainedLastGood, RETAINED_KEYS, RETAINED_KEYS, "retainedLastGood");
        const { retainedBecause, eligibleForCurrentSemanticInput, ...ref } = value.retainedLastGood;
        assertLastGoodRef(ref, "retainedLastGood");
        if (retainedBecause !== value.freshness.decision
            || retainedBecause === "fresh"
            || eligibleForCurrentSemanticInput !== false) {
            throw new Error("retainedLastGood disposition is invalid");
        }
    }
    if (isFresh && value.retainedLastGood !== null) {
        throw new Error("fresh result cannot retain last-good");
    }
    assertPrivacy(value.privacy, "privacy");
    const { resultId, resultDigest, ...base } = value;
    const expectedDigest = (0, source_contracts_js_1.taskMapContractDigest)(base);
    if (resultDigest !== expectedDigest
        || resultId !== stableId("tmpr", expectedDigest)) {
        throw new Error("meeting producer result digest is inconsistent");
    }
}
