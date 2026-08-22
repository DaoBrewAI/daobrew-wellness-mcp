"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_MEETING_MENTION_IDENTITY_DOMAIN = void 0;
exports.buildMeetingEvidenceDrafts = buildMeetingEvidenceDrafts;
const mention_extraction_js_1 = require("./mention-extraction.js");
const mention_normalization_js_1 = require("./mention-normalization.js");
const meeting_producer_freshness_js_1 = require("./meeting-producer-freshness.js");
const source_contracts_js_1 = require("./source-contracts.js");
const text_contract_js_1 = require("./text-contract.js");
exports.TASKMAP_MEETING_MENTION_IDENTITY_DOMAIN = "taskmap-meeting-mention-identity.1";
function boundedSummary(value) {
    const canonical = value.trim().replace(/\s+/gu, " ");
    return (0, text_contract_js_1.boundedUtf16)(canonical, meeting_producer_freshness_js_1.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxSummaryCharacters);
}
function meetingEvidenceKind(speechActClass) {
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
/**
 * Convert a validated recorded extraction into the bounded producer-draft
 * contract. The exact note and model output remain inputs only.
 */
function buildMeetingEvidenceDrafts(note, envelope) {
    if (envelope.inputDigest !== (0, source_contracts_js_1.taskMapContractDigest)(note.sourceText)) {
        throw new Error("Task Map meeting draft envelope input digest mismatch");
    }
    const extraction = (0, mention_extraction_js_1.validateMentionExtraction)(envelope.outputJson, note.sourceText);
    const extractionEnvelopeDigest = (0, source_contracts_js_1.taskMapContractDigest)(envelope);
    return extraction.mentions.map((mention) => {
        const normalizedText = (0, mention_normalization_js_1.normalizeMentionText)(mention.text);
        if (normalizedText.length === 0) {
            throw new Error("Task Map normalized mention identity is empty");
        }
        const mentionIdentityDigest = (0, source_contracts_js_1.taskMapContractDigest)({
            domain: exports.TASKMAP_MEETING_MENTION_IDENTITY_DOMAIN,
            normalizedText,
        });
        return {
            kind: meetingEvidenceKind(mention.class),
            title: mention.title,
            summary: boundedSummary(mention.text),
            occurredAt: note.occurredAt,
            observedAt: note.observedAt,
            quality: "structured_generated",
            coverage: "partial",
            confidence: mention.confidence,
            speechActClass: mention.class,
            speechActActor: mention.actor,
            mentionIdentityDigest,
            extractionEnvelopeDigest,
        };
    });
}
